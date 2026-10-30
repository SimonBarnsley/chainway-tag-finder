import { describe, expect, it } from "vitest";
import { deduplicateTagReads, extractTagsFromJson, extractTagsFromText, extractTagsFromXml } from "./rfid-payload";
import { decodeSgtin, encodeSgtin96 } from "./sgtin-decoder";

const epc = "303900000000000000000001";

describe("existing RFID ingestion behaviour", () => {
  it("reduces repeated EPCs to one strongest observation per batch", () => {
    expect(deduplicateTagReads([
      { epc, rssi: -70, antennaPort: 1 },
      { epc, rssi: -40, antennaPort: 2 },
      { epc, rssi: -60, antennaPort: 3 },
    ])).toEqual([{ epc, rssi: -40, antennaPort: 2 }]);
  });
  it("preserves distinct tags", () => {
    expect(deduplicateTagReads([{ epc }, { epc: "303900000000000000000002" }])).toHaveLength(2);
  });
  it("reads nested JSON with antenna zero and numeric RSSI", () => {
    expect(extractTagsFromJson({ data: { tags: [{ EPC: epc.toLowerCase(), RSSI: "-42", antenna: 0 }] } })).toEqual([{ epc, rssi: -42, antennaPort: 0 }]);
  });
  it("reads XML attributes", () => {
    expect(extractTagsFromXml(`<tag epc="${epc}" rssi="-48" antenna="2"/>`)).toEqual([{ epc, rssi: -48, antennaPort: 2 }]);
  });
  it("deduplicates form and plain-text EPCs", () => {
    expect(extractTagsFromText(`epc=${epc}%0A${epc}`)).toEqual([{ epc }]);
  });
  it("records zero observations for a heartbeat, not fabricated reads", () => {
    expect(extractTagsFromJson({ type: "heartbeat" })).toEqual([]);
  });
  it("rejects non-hex in the SGTIN decoder", () => {
    expect(decodeSgtin("NOT_A_VALID_EPC")).toHaveProperty("error");
  });
  it("round-trips the SGTIN identity", () => {
    const encoded = encodeSgtin96({ companyPrefix: "0614141", itemReference: "812345", serial: 123 });
    expect(decodeSgtin(encoded)).toMatchObject({ companyPrefix: "0614141", itemReference: "812345", serial: "123" });
  });
  it("documents permissive JSON admission requiring further validation", () => {
    expect(extractTagsFromJson({ epc: "NOTHEX" })[0]?.epc).toBe("NOTHEX");
  });
});