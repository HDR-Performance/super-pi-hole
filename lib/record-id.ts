// IDs identify application records, not authentication credentials. getRandomValues
// also works on LAN HTTP, where crypto.randomUUID is not exposed by browsers.
export function recordId(source: Pick<Crypto, 'getRandomValues'> = globalThis.crypto): string {
  if (!source?.getRandomValues) throw new Error('This browser cannot generate record IDs.');
  const bytes = source.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const value = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}
