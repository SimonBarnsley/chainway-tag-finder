export type ReaderConnection = "connected" | "disconnected" | "unknown";

// A successful SDK connection is evidence even when Android emits no event.
// Retain it across header remounts; never assume that plugin presence means connected.
let connection: ReaderConnection = "unknown";
const listeners = new Set<() => void>();

export function getReaderConnection(): ReaderConnection {
  return connection;
}

export function getServerReaderConnection(): ReaderConnection {
  return "unknown";
}

export function subscribeReaderConnection(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function updateReaderConnection(next: ReaderConnection) {
  if (connection === next) return;
  connection = next;
  listeners.forEach((listener) => listener());
}