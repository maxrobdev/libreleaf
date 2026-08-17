import { createServer } from "node:http";
import {
  handleLibreSendRelayRequest,
  MemoryLibreSendRelayStore,
} from "../../lib/libresend/relay.ts";
import { FilesystemLibreSendRelayStore } from "./filesystem-store.ts";
import { loadLocalLibreSendHostExtension } from "./load-extension.ts";

function boundedNumber(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(Math.max(Math.floor(parsed), minimum), maximum) : fallback;
}

const host = process.env.LIBRESEND_HOST || "127.0.0.1";
const port = boundedNumber(process.env.LIBRESEND_PORT, 8788, 1, 65_535);
const maxBytes = boundedNumber(process.env.LIBRESEND_MAX_BYTES, 25 * 1024 * 1024, 1024, 200 * 1024 * 1024);
const ttlSeconds = boundedNumber(process.env.LIBRESEND_TTL_SECONDS, 15 * 60, 60, 24 * 60 * 60);
const allowedOrigins = (process.env.LIBRESEND_ALLOWED_ORIGINS || "http://localhost:3000")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const storageDirectory = process.env.LIBRESEND_STORAGE_DIR?.trim() || "";
const storageMaxBytes = boundedNumber(process.env.LIBRESEND_STORAGE_MAX_BYTES, 2 * 1024 * 1024 * 1024, maxBytes, 1024 * 1024 * 1024 * 1024);
const storageMaxObjects = boundedNumber(process.env.LIBRESEND_STORAGE_MAX_OBJECTS, 10_000, 1, 100_000);
const defaultStore = storageDirectory
  ? new FilesystemLibreSendRelayStore({ directory: storageDirectory, maxBytes: storageMaxBytes, maxObjects: storageMaxObjects })
  : new MemoryLibreSendRelayStore({ maxBytes: storageMaxBytes, maxObjects: storageMaxObjects });
const defaultStorageName: "filesystem" | "memory" = storageDirectory ? "filesystem" : "memory";
const extension = await loadLocalLibreSendHostExtension(process.env.LIBRESEND_EXTENSION || "", {
  allowedOrigins: Object.freeze([...allowedOrigins]),
  limits: Object.freeze({ maxBytes, ttlSeconds, storageMaxBytes, storageMaxObjects }),
  defaultStorage: Object.freeze({
    name: defaultStorageName,
    store: defaultStore,
  }),
});
const store = extension?.store ?? defaultStore;
const storageName = extension?.storageName ?? defaultStorageName;
const modules = extension?.modules ?? [];

const rateBuckets = new Map<string, { window: number; count: number }>();
function allowAddress(address: string) {
  const window = Math.floor(Date.now() / 60_000);
  if (rateBuckets.size > 10_000) {
    for (const [key, bucket] of rateBuckets) if (bucket.window !== window) rateBuckets.delete(key);
  }
  const current = rateBuckets.get(address);
  if (!current || current.window !== window) {
    rateBuckets.set(address, { window, count: 1 });
    return true;
  }
  current.count += 1;
  return current.count <= 40;
}

const server = createServer(async (incoming, outgoing) => {
  try {
    const chunks: Uint8Array[] = [];
    let length = 0;
    for await (const chunk of incoming) {
      const bytes = typeof chunk === "string" ? new TextEncoder().encode(chunk) : new Uint8Array(chunk);
      length += bytes.byteLength;
      if (length > maxBytes) {
        outgoing.writeHead(413, { "content-type": "application/json", "cache-control": "no-store" });
        outgoing.end(JSON.stringify({ error: "Transfer exceeds the configured relay limit." }));
        incoming.destroy();
        return;
      }
      chunks.push(bytes);
    }

    const body = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const headers = new Headers();
    for (const [name, value] of Object.entries(incoming.headers)) {
      if (Array.isArray(value)) value.forEach((entry) => headers.append(name, entry));
      else if (value !== undefined) headers.set(name, value);
    }
    const requestUrl = new URL(incoming.url || "/", `http://${incoming.headers.host || `${host}:${port}`}`);
    const request = new Request(requestUrl, {
      method: incoming.method,
      headers,
      body: incoming.method === "GET" || incoming.method === "HEAD" ? undefined : body,
    });
    const address = incoming.socket.remoteAddress || "unknown";
    const response = await handleLibreSendRelayRequest(request, {
      store,
      maxBytes,
      ttlSeconds,
      allowedOrigins,
      allowRequest: async (relayRequest) => (
        allowAddress(address)
        && (extension?.allowRequest ? await extension.allowRequest(relayRequest) : true)
      ),
      storageName,
      modules,
      hostExtension: extension?.id,
      allowedHeaders: extension?.allowedHeaders,
      publicCapabilities: extension?.publicCapabilities,
    });
    outgoing.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    outgoing.end(new Uint8Array(await response.arrayBuffer()));
  } catch {
    outgoing.writeHead(500, { "content-type": "application/json", "cache-control": "no-store" });
    outgoing.end(JSON.stringify({ error: "LibreSend relay error." }));
  }
});

server.listen(port, host, () => {
  process.stdout.write(`LibreSend relay listening on http://${host}:${port}\n`);
  process.stdout.write(`Allowed origins: ${allowedOrigins.join(", ")}\n`);
  process.stdout.write(`Limits: ${maxBytes} bytes, ${ttlSeconds} seconds, one retrieval\n`);
  process.stdout.write(`Storage: ${storageName}${storageDirectory ? ` (${storageDirectory})` : ""}\n`);
  if (extension) process.stdout.write(`Extension: ${extension.id}${modules.length ? ` (${modules.map((module) => module.id).join(", ")})` : ""}\n`);
  void Promise.resolve(extension?.onReady?.({
    host,
    port,
    storage: storageName,
    modules: modules.map((module) => module.id),
  })).catch(() => {
    process.stderr.write("LibreSend extension onReady hook failed.\n");
  });
});

let stopping = false;
async function stop(signal: NodeJS.Signals) {
  if (stopping) return;
  stopping = true;
  process.stdout.write(`LibreSend relay stopping (${signal}).\n`);
  const forced = setTimeout(() => process.exit(1), 10_000);
  forced.unref();
  server.close(async (error) => {
    let exitCode = error ? 1 : 0;
    try {
      await extension?.onClose?.();
    } catch {
      exitCode = 1;
      process.stderr.write("LibreSend extension onClose hook failed.\n");
    }
    clearTimeout(forced);
    process.exit(exitCode);
  });
}

process.once("SIGINT", () => void stop("SIGINT"));
process.once("SIGTERM", () => void stop("SIGTERM"));
