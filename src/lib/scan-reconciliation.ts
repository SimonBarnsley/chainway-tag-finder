/** Absence from a read session is not proof of physical absence. */
export function reconcileTagReads(expected: Iterable<string>, observed: Iterable<string>) {
  const known = new Set(Array.from(expected, (epc) => epc.toUpperCase()));
  const seen = new Set(Array.from(observed, (epc) => epc.toUpperCase()));
  return {
    found: [...seen].filter((epc) => known.has(epc)),
    notSeen: [...known].filter((epc) => !seen.has(epc)),
    unexpected: [...seen].filter((epc) => !known.has(epc)),
  };
}