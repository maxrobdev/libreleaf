import { checkReaderFile } from "./core.ts";

export const LIBRESEND_ENVELOPE_VERSION = 1;
export const LIBRESEND_ENVELOPE_OVERHEAD_BYTES = 32;

const MAGIC = new Uint8Array([0x4c, 0x53, 0x45, 0x31]); // LSE1
const IV_BYTES = 12;
const KEY_BYTES = 32;
const TAG_BYTES = 16;
const METADATA_LIMIT_BYTES = 4096;

type CryptoProvider = Pick<Crypto, "getRandomValues" | "subtle">;

export type EncryptedReaderFile = {
  envelope: Uint8Array;
  key: string;
};

export type DecryptedReaderFile = {
  name: string;
  type: string;
  bytes: Uint8Array;
};

function encodeBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("The LibreSend key is invalid.");
  const normalised = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalised.padEnd(Math.ceil(normalised.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function writeUint32(target: Uint8Array, offset: number, value: number) {
  new DataView(target.buffer, target.byteOffset, target.byteLength).setUint32(offset, value, false);
}

function readUint32(source: Uint8Array, offset: number) {
  return new DataView(source.buffer, source.byteOffset, source.byteLength).getUint32(offset, false);
}

function safeFilename(value: unknown) {
  if (typeof value !== "string") throw new Error("The encrypted file metadata is invalid.");
  const name = Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return character === "/" || character === "\\" || code < 32 || code === 127 ? "-" : character;
  }).join("").trim().slice(0, 180);
  if (!name) throw new Error("The encrypted file has no usable name.");
  return name;
}

export function isLibreSendEnvelope(value: Uint8Array) {
  if (value.byteLength < MAGIC.byteLength + IV_BYTES + TAG_BYTES + 4) return false;
  return MAGIC.every((byte, index) => value[index] === byte);
}

export async function encryptReaderFile(file: File, cryptoProvider: CryptoProvider = globalThis.crypto): Promise<EncryptedReaderFile> {
  const checked = checkReaderFile(file);
  if (!checked.ok) throw new Error(checked.reason);

  const metadata = new TextEncoder().encode(JSON.stringify({
    name: safeFilename(file.name),
    type: file.type || "application/octet-stream",
    size: file.size,
    format: checked.format,
  }));
  if (metadata.byteLength > METADATA_LIMIT_BYTES) throw new Error("The file metadata is too large.");

  const fileBytes = new Uint8Array(await file.arrayBuffer());
  const cleartext = new Uint8Array(4 + metadata.byteLength + fileBytes.byteLength);
  writeUint32(cleartext, 0, metadata.byteLength);
  cleartext.set(metadata, 4);
  cleartext.set(fileBytes, 4 + metadata.byteLength);

  const keyBytes = cryptoProvider.getRandomValues(new Uint8Array(KEY_BYTES));
  const iv = cryptoProvider.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await cryptoProvider.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(await cryptoProvider.subtle.encrypt({ name: "AES-GCM", iv }, key, cleartext));
  const envelope = new Uint8Array(MAGIC.byteLength + iv.byteLength + ciphertext.byteLength);
  envelope.set(MAGIC, 0);
  envelope.set(iv, MAGIC.byteLength);
  envelope.set(ciphertext, MAGIC.byteLength + iv.byteLength);
  return { envelope, key: encodeBase64Url(keyBytes) };
}

export async function decryptReaderFile(
  envelope: Uint8Array,
  encodedKey: string,
  cryptoProvider: CryptoProvider = globalThis.crypto,
): Promise<DecryptedReaderFile> {
  if (!isLibreSendEnvelope(envelope)) throw new Error("This is not a supported LibreSend envelope.");
  const keyBytes = decodeBase64Url(encodedKey);
  if (keyBytes.byteLength !== KEY_BYTES) throw new Error("The LibreSend key is invalid.");

  const iv = envelope.slice(MAGIC.byteLength, MAGIC.byteLength + IV_BYTES);
  const ciphertext = envelope.slice(MAGIC.byteLength + IV_BYTES);
  const key = await cryptoProvider.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
  let cleartext: Uint8Array;
  try {
    cleartext = new Uint8Array(await cryptoProvider.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext));
  } catch {
    throw new Error("This transfer could not be decrypted. The link may be incomplete or altered.");
  }

  const metadataLength = readUint32(cleartext, 0);
  if (metadataLength <= 0 || metadataLength > METADATA_LIMIT_BYTES || 4 + metadataLength > cleartext.byteLength) {
    throw new Error("The encrypted file metadata is invalid.");
  }

  let metadata: { name?: unknown; type?: unknown; size?: unknown };
  try {
    metadata = JSON.parse(new TextDecoder().decode(cleartext.slice(4, 4 + metadataLength)));
  } catch {
    throw new Error("The encrypted file metadata is invalid.");
  }
  const bytes = cleartext.slice(4 + metadataLength);
  if (!Number.isSafeInteger(metadata.size) || metadata.size !== bytes.byteLength) {
    throw new Error("The encrypted file size does not match its metadata.");
  }

  return {
    name: safeFilename(metadata.name),
    type: typeof metadata.type === "string" && metadata.type.length <= 120 ? metadata.type : "application/octet-stream",
    bytes,
  };
}
