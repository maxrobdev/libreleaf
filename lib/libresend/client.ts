import { decryptReaderFile, encryptReaderFile } from "./crypto.ts";
import { LIBRESEND_RELAY_PROTOCOL } from "./relay.ts";
import { formatReaderFileSize } from "./core.ts";

const transferIdPattern = /^[A-Za-z0-9_-]{24}$/;

export type RelayUpload = {
  id: string;
  expiresAt: string;
  receiveUrl: string;
};

export type RelayStatus = {
  protocol: string;
  maxBytes: number;
  ttlSeconds: number;
  encryption: string;
  retrieval: string;
  storage?: string;
  modules?: string[];
};

export function normaliseRelayUrl(value: string) {
  const url = new URL(value);
  const localhost = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (url.protocol !== "https:" && !(localhost && url.protocol === "http:")) {
    throw new Error("LibreSend relays require HTTPS, except on localhost.");
  }
  url.pathname = url.pathname.replace(/\/$/, "");
  url.search = "";
  url.hash = "";
  return url.href.replace(/\/$/, "");
}

export async function getRelayStatus(relayValue: string, fetcher: typeof fetch = fetch): Promise<RelayStatus> {
  const relayUrl = normaliseRelayUrl(relayValue);
  const response = await fetcher(`${relayUrl}/v1/status`, { headers: { Accept: "application/json" }, cache: "no-store" });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok || !payload || typeof payload !== "object") throw new Error("The LibreSend relay status is unavailable.");
  const value = payload as Partial<RelayStatus>;
  if (value.protocol !== LIBRESEND_RELAY_PROTOCOL || !Number.isSafeInteger(value.maxBytes) || (value.maxBytes ?? 0) < 1024 || !Number.isSafeInteger(value.ttlSeconds)) {
    throw new Error("The LibreSend relay returned an invalid capability response.");
  }
  return value as RelayStatus;
}

export async function createEncryptedRelayTransfer(input: {
  file: File;
  relayUrl: string;
  appUrl: string;
  fetcher?: typeof fetch;
}) {
  const relayUrl = normaliseRelayUrl(input.relayUrl);
  const fetcher = input.fetcher ?? fetch;
  const status = await getRelayStatus(relayUrl, fetcher);
  if (input.file.size + 8192 > status.maxBytes) {
    throw new Error(`This relay accepts files up to ${formatReaderFileSize(status.maxBytes)}.`);
  }
  const { envelope, key } = await encryptReaderFile(input.file);
  const response = await fetcher(`${relayUrl}/v1/transfers`, {
    method: "POST",
    headers: {
      "content-type": "application/octet-stream",
      "x-libresend-version": LIBRESEND_RELAY_PROTOCOL,
    },
    body: envelope.slice().buffer,
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok || !payload || typeof payload !== "object" || !("id" in payload) || typeof payload.id !== "string" || !transferIdPattern.test(payload.id)) {
    const message = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
      ? payload.error
      : "The LibreSend relay rejected this transfer.";
    throw new Error(message);
  }
  const expiresAt = "expiresAt" in payload && typeof payload.expiresAt === "string" ? payload.expiresAt : "";
  const receiveUrl = new URL("/send", input.appUrl);
  receiveUrl.searchParams.set("receive", payload.id);
  receiveUrl.hash = new URLSearchParams({ key, relay: relayUrl }).toString();
  return { id: payload.id, expiresAt, receiveUrl: receiveUrl.href } satisfies RelayUpload;
}

export async function receiveEncryptedRelayTransfer(input: {
  id: string;
  key: string;
  relayUrl: string;
  fetcher?: typeof fetch;
}) {
  if (!transferIdPattern.test(input.id)) throw new Error("The LibreSend transfer identifier is invalid.");
  const relayUrl = normaliseRelayUrl(input.relayUrl);
  const response = await (input.fetcher ?? fetch)(`${relayUrl}/v1/transfers/${input.id}`, {
    headers: { Accept: "application/octet-stream", "x-libresend-version": LIBRESEND_RELAY_PROTOCOL },
    cache: "no-store",
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: unknown } | null;
    throw new Error(typeof payload?.error === "string" ? payload.error : "The LibreSend transfer is unavailable.");
  }
  const envelope = new Uint8Array(await response.arrayBuffer());
  return decryptReaderFile(envelope, input.key);
}
