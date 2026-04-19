/**
 * GS1 EPC SGTIN-96 and SGTIN-198 decoder
 * Ref: GS1 EPC Tag Data Standard v2.1
 */

export interface SgtinDecoded {
  format: "SGTIN-96" | "SGTIN-198";
  header: string;
  filter: number;
  filterDescription: string;
  partition: number;
  companyPrefix: string;
  itemReference: string;
  serial: string;
  gtin14: string;
  pureIdentityUri: string;
  tagUri: string;
}

export interface DecodeError {
  error: string;
}

const FILTER_VALUES: Record<number, string> = {
  0: "All Others",
  1: "Point of Sale (POS)",
  2: "Full Case Transport",
  3: "Reserved",
  4: "Inner Pack Trade Item",
  5: "Reserved",
  6: "Unit Load",
  7: "Component / Part",
};

// SGTIN-96 partition table: [partition] => [companyPrefixBits, companyPrefixDigits, itemRefBits, itemRefDigits]
const PARTITION_TABLE_96: Record<number, [number, number, number, number]> = {
  0: [40, 12, 4, 1],
  1: [37, 11, 7, 2],
  2: [34, 10, 10, 3],
  3: [30, 9, 14, 4],
  4: [27, 8, 17, 5],
  5: [24, 7, 20, 6],
  6: [20, 6, 24, 7],
};

// SGTIN-198 partition table (same prefix/item structure, serial is string)
const PARTITION_TABLE_198 = PARTITION_TABLE_96;

function hexToBinary(hex: string): string {
  return hex
    .split("")
    .map((h) => parseInt(h, 16).toString(2).padStart(4, "0"))
    .join("");
}

function binaryToInt(bin: string): number {
  return parseInt(bin, 2);
}

function decodeUri7BitString(bits: string): string {
  // SGTIN-198 serial is encoded as up to 20 chars of 7-bit ASCII
  let result = "";
  for (let i = 0; i < bits.length; i += 7) {
    const charBits = bits.slice(i, i + 7);
    if (charBits.length < 7) break;
    const code = binaryToInt(charBits);
    if (code === 0) break; // null terminator
    result += String.fromCharCode(code);
  }
  return result;
}

function computeCheckDigit(digits12: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = parseInt(digits12[i], 10);
    sum += i % 2 === 0 ? d : d * 3;
  }
  const check = (10 - (sum % 10)) % 10;
  return check.toString();
}

function buildGtin14(
  indicator: string,
  companyPrefix: string,
  itemReference: string
): string {
  // GTIN-14 = indicator digit + company prefix + item reference (without indicator) = 13 digits + check digit
  const digits12 = indicator + companyPrefix + itemReference;
  const check = computeCheckDigit(digits12);
  return digits12 + check;
}

export function decodeSgtin(hexEpc: string): SgtinDecoded | DecodeError {
  const cleaned = hexEpc.replace(/[\s-]/g, "").toUpperCase();

  if (!/^[0-9A-F]+$/.test(cleaned)) {
    return { error: "Invalid hex characters. EPC must be hexadecimal." };
  }

  const bits = hexToBinary(cleaned);

  // Determine format from header (first 8 bits)
  const headerBits = bits.slice(0, 8);
  const headerVal = binaryToInt(headerBits);
  const headerHex = headerVal.toString(16).toUpperCase().padStart(2, "0");

  let format: "SGTIN-96" | "SGTIN-198";

  if (headerVal === 0x30) {
    format = "SGTIN-96";
    if (cleaned.length !== 24) {
      return { error: `SGTIN-96 requires 24 hex characters (96 bits). Got ${cleaned.length}.` };
    }
  } else if (headerVal === 0x36) {
    format = "SGTIN-198";
    if (cleaned.length < 50) {
      return { error: `SGTIN-198 requires 50 hex characters (198+ bits). Got ${cleaned.length}.` };
    }
  } else {
    return {
      error: `Unrecognized EPC header 0x${headerHex}. Expected 0x30 (SGTIN-96) or 0x36 (SGTIN-198).`,
    };
  }

  // Filter value: bits 8-10 (3 bits)
  const filter = binaryToInt(bits.slice(8, 11));
  const filterDescription = FILTER_VALUES[filter] ?? "Unknown";

  // Partition: bits 11-13 (3 bits)
  const partition = binaryToInt(bits.slice(11, 14));
  const partitionTable =
    format === "SGTIN-96" ? PARTITION_TABLE_96 : PARTITION_TABLE_198;

  if (!(partition in partitionTable)) {
    return { error: `Invalid partition value: ${partition}` };
  }

  const [cpBits, cpDigits, irBits, irDigits] = partitionTable[partition];

  // Company prefix: starts at bit 14
  const companyPrefixBin = bits.slice(14, 14 + cpBits);
  const companyPrefix = binaryToInt(companyPrefixBin)
    .toString()
    .padStart(cpDigits, "0");

  // Item reference: follows company prefix
  const irStart = 14 + cpBits;
  const itemReferenceBin = bits.slice(irStart, irStart + irBits);
  const itemReferenceRaw = binaryToInt(itemReferenceBin)
    .toString()
    .padStart(irDigits, "0");

  // The indicator digit is the first digit of item reference for GTIN construction
  const indicator = itemReferenceRaw[0];
  const itemRefWithoutIndicator = itemReferenceRaw.slice(1);

  // Serial
  let serial: string;
  const serialStart = 14 + cpBits + irBits;

  if (format === "SGTIN-96") {
    // 38 bits numeric serial
    const serialBin = bits.slice(serialStart, serialStart + 38);
    serial = binaryToInt(serialBin).toString();
  } else {
    // SGTIN-198: 140 bits, 7-bit ASCII encoded string (up to 20 chars)
    const serialBin = bits.slice(serialStart, serialStart + 140);
    serial = decodeUri7BitString(serialBin);
  }

  const gtin14 = buildGtin14(indicator, companyPrefix, itemRefWithoutIndicator);

  const pureIdentityUri = `urn:epc:id:sgtin:${companyPrefix}.${itemReferenceRaw}.${serial}`;
  const tagUri = `urn:epc:tag:${format.toLowerCase()}:${filter}.${companyPrefix}.${itemReferenceRaw}.${serial}`;

  return {
    format,
    header: `0x${headerHex}`,
    filter,
    filterDescription,
    partition,
    companyPrefix,
    itemReference: itemReferenceRaw,
    serial,
    gtin14,
    pureIdentityUri,
    tagUri,
  };
}

// ─── SGTIN-96 ENCODER ───────────────────────────────────────────────

export interface SgtinEncodeInput {
  companyPrefix: string;   // e.g. "0614141" — must match a partition length (6-12 digits)
  itemReference: string;   // indicator digit + item ref digits (total = 13 - companyPrefix.length)
  serial: number;          // 0 … 274877906943 (38-bit)
  filter?: number;         // 0-7, default 1 (POS)
}

/**
 * Encode an SGTIN-96 hex EPC string from GS1 components.
 * Returns the 24-character uppercase hex EPC.
 */
export function encodeSgtin96(input: SgtinEncodeInput): string {
  const { companyPrefix, itemReference, serial, filter = 1 } = input;

  // Determine partition from company prefix digit count
  const cpDigits = companyPrefix.length;
  let partition: number | null = null;
  for (const [p, [, cpD]] of Object.entries(PARTITION_TABLE_96)) {
    if (cpD === cpDigits) { partition = Number(p); break; }
  }
  if (partition === null) {
    throw new Error(`Company prefix must be 6-12 digits. Got ${cpDigits}.`);
  }

  const [cpBits, , irBits, irDigits] = PARTITION_TABLE_96[partition];

  if (itemReference.length !== irDigits) {
    throw new Error(`Item reference must be ${irDigits} digits for a ${cpDigits}-digit company prefix. Got ${itemReference.length}.`);
  }

  if (serial < 0 || serial > 274877906943) {
    throw new Error("Serial must be 0–274877906943 (38-bit).");
  }

  const header = "00110000"; // 0x30
  const filterBin = filter.toString(2).padStart(3, "0");
  const partBin = partition.toString(2).padStart(3, "0");
  const cpBin = parseInt(companyPrefix, 10).toString(2).padStart(cpBits, "0");
  const irBin = parseInt(itemReference, 10).toString(2).padStart(irBits, "0");
  const serialBin = serial.toString(2).padStart(38, "0");

  const allBits = header + filterBin + partBin + cpBin + irBin + serialBin; // 96 bits

  // Convert 96-bit string to 24-char hex
  let hex = "";
  for (let i = 0; i < 96; i += 4) {
    hex += parseInt(allBits.slice(i, i + 4), 2).toString(16);
  }
  return hex.toUpperCase();
}

/**
 * Generate an SGTIN-96 EPC with a random serial for a given company prefix and item reference.
 * If no company prefix is provided, uses a default GS1 example prefix.
 */
export function generateRandomSgtin96(opts?: {
  companyPrefix?: string;
  itemReference?: string;
  filter?: number;
}): string {
  const companyPrefix = opts?.companyPrefix || "0000000"; // 7-digit default (partition 1)
  const cpDigits = companyPrefix.length;
  let partition: number | null = null;
  for (const [p, [, cpD]] of Object.entries(PARTITION_TABLE_96)) {
    if (cpD === cpDigits) { partition = Number(p); break; }
  }
  if (partition === null) throw new Error("Invalid company prefix length");
  const [, , , irDigits] = PARTITION_TABLE_96[partition];

  // Auto-generate item reference if not provided
  const itemReference = opts?.itemReference || "0".padStart(irDigits, "0");

  // Random 38-bit serial (max 274877906943)
  const serial = Math.floor(Math.random() * 274877906943);

  return encodeSgtin96({ companyPrefix, itemReference, serial, filter: opts?.filter ?? 1 });
}
