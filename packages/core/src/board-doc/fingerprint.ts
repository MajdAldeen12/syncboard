/**
 * A short name for a run of bytes: its 32-bit FNV-1a hash in hexadecimal.
 *
 * Used to tell whether two tabs started from the same board content. It is
 * not a security measure.
 */
export function fingerprint(bytes: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
