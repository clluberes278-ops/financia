const encoder = new TextEncoder();
const decoder = new TextDecoder();

function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function toBase64(value: Uint8Array): string {
  return btoa(Array.from(value, (byte) => String.fromCharCode(byte)).join(''));
}

async function importEncryptionKey(value: string): Promise<CryptoKey> {
  const bytes = fromBase64(value);
  if (bytes.length !== 32) throw new Error('GMAIL_REFRESH_TOKEN_KEY must be a base64-encoded 32-byte key.');
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptSecret(value: string, keyValue: string): Promise<string> {
  const key = await importEncryptionKey(keyValue);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(value));
  return `${toBase64(iv)}.${toBase64(new Uint8Array(encrypted))}`;
}

export async function decryptSecret(value: string, keyValue: string): Promise<string> {
  const [ivValue, encryptedValue, ...extra] = value.split('.');
  if (!ivValue || !encryptedValue || extra.length > 0) throw new Error('Stored Gmail credential has an invalid format.');
  const key = await importEncryptionKey(keyValue);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(ivValue) },
    key,
    fromBase64(encryptedValue)
  );
  return decoder.decode(decrypted);
}
