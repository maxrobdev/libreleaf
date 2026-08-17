import { isLibreSendEnvelope } from "./crypto.ts";
import { LIBRESEND_RELAY_DEFAULT_MAX_FILE_BYTES } from "./core.ts";

export const LIBRESEND_RELAY_PROTOCOL = "1";
export const LIBRESEND_RELAY_DEFAULT_TTL_SECONDS = 15 * 60;

export type LibreSendRelayObject = {
  id: string;
  body: Uint8Array;
  createdAt: number;
  expiresAt: number;
};

export interface LibreSendRelayStore {
  put(value: LibreSendRelayObject): Promise<void>;
  take(id: string, now: number): Promise<LibreSendRelayObject | null>;
  prune(now: number): Promise<number>;
}

export type LibreSendRelayRequestContext = {
  method: string;
  pathname: string;
  origin: string | null;
};

export type LibreSendRelayEvent =
  | { type: "transfer.stored"; transferId: string; bytes: number; occurredAt: number; expiresAt: number }
  | { type: "transfer.received"; transferId: string; bytes: number; occurredAt: number }
  | { type: "transfer.missed"; transferId: string; occurredAt: number };

export interface LibreSendRelayModule {
  id: string;
  version?: string;
  capabilities?: string[];
  authorize?(context: LibreSendRelayRequestContext): boolean | Promise<boolean>;
  onEvent?(event: LibreSendRelayEvent): void | Promise<void>;
}

export class LibreSendRelayCapacityError extends Error {}

export class MemoryLibreSendRelayStore implements LibreSendRelayStore {
  readonly #objects = new Map<string, LibreSendRelayObject>();
  readonly #maxObjects: number;
  readonly #maxBytes: number;

  constructor(options: { maxObjects?: number; maxBytes?: number } = {}) {
    this.#maxObjects = Math.min(Math.max(options.maxObjects ?? 128, 1), 10_000);
    this.#maxBytes = Math.min(Math.max(options.maxBytes ?? 256 * 1024 * 1024, 1024), 2 * 1024 * 1024 * 1024);
  }

  async put(value: LibreSendRelayObject) {
    if (value.body.byteLength > this.#maxBytes) throw new LibreSendRelayCapacityError("Transfer exceeds relay storage capacity.");
    let storedBytes = [...this.#objects.values()].reduce((total, item) => total + item.body.byteLength, 0);
    while (this.#objects.size >= this.#maxObjects || storedBytes + value.body.byteLength > this.#maxBytes) {
      const oldest = this.#objects.entries().next().value as [string, LibreSendRelayObject] | undefined;
      if (!oldest) break;
      this.#objects.delete(oldest[0]);
      storedBytes -= oldest[1].body.byteLength;
    }
    this.#objects.set(value.id, value);
  }

  async take(id: string, now: number) {
    const value = this.#objects.get(id) ?? null;
    this.#objects.delete(id);
    return value && value.expiresAt > now ? value : null;
  }

  async prune(now: number) {
    let removed = 0;
    for (const [id, value] of this.#objects) {
      if (value.expiresAt > now) continue;
      this.#objects.delete(id);
      removed += 1;
    }
    return removed;
  }
}

export type LibreSendRelayConfig = {
  store: LibreSendRelayStore;
  maxBytes?: number;
  ttlSeconds?: number;
  allowedOrigins?: string[];
  now?: () => number;
  randomBytes?: (length: number) => Uint8Array;
  allowRequest?: (request: Request) => boolean | Promise<boolean>;
  modules?: LibreSendRelayModule[];
  storageName?: string;
  hostExtension?: string;
  allowedHeaders?: string[];
  publicCapabilities?: Record<string, string | number | boolean>;
};

const transferIdPattern = /^[A-Za-z0-9_-]{24}$/;
const moduleIdPattern = /^[a-z][a-z0-9-]{1,40}$/;
const moduleVersionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const moduleCapabilityPattern = /^[a-z][a-z0-9-]{1,48}$/;

function validateModules(modules: LibreSendRelayModule[]) {
  const ids = new Set<string>();
  for (const extension of modules) {
    if (!moduleIdPattern.test(extension.id)) throw new Error("LibreSend relay module IDs use lowercase letters, numbers and hyphens.");
    if (ids.has(extension.id)) throw new Error(`LibreSend relay module ${extension.id} is already registered.`);
    if (extension.version !== undefined && !moduleVersionPattern.test(extension.version)) {
      throw new Error(`LibreSend relay module ${extension.id} has an invalid version.`);
    }
    if (extension.capabilities && (
      extension.capabilities.length > 16
      || new Set(extension.capabilities).size !== extension.capabilities.length
      || extension.capabilities.some((capability) => !moduleCapabilityPattern.test(capability))
    )) {
      throw new Error(`LibreSend relay module ${extension.id} has invalid capabilities.`);
    }
    ids.add(extension.id);
  }
}

async function modulesAllowRequest(request: Request, modules: LibreSendRelayModule[]) {
  const url = new URL(request.url);
  const context: LibreSendRelayRequestContext = {
    method: request.method,
    pathname: url.pathname,
    origin: request.headers.get("origin"),
  };
  for (const extension of modules) {
    if (extension.authorize && !(await extension.authorize(context))) return false;
  }
  return true;
}

async function emitRelayEvent(modules: LibreSendRelayModule[], event: LibreSendRelayEvent) {
  await Promise.allSettled(modules.map((extension) => extension.onEvent?.(event)));
}

function json(value: unknown, status: number, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...headers,
    },
  });
}

function randomId(randomBytes: (length: number) => Uint8Array) {
  let binary = "";
  for (const byte of randomBytes(18)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function originHeaders(request: Request, allowedOrigins: string[], allowedHeaders: string[]): Record<string, string> | null {
  const origin = request.headers.get("origin");
  if (!origin) return {};
  const sameOrigin = origin === new URL(request.url).origin;
  if (!sameOrigin && !allowedOrigins.includes(origin)) return null;
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": ["content-type", "x-libresend-version", ...allowedHeaders].join(", "),
    "access-control-max-age": "600",
    vary: "Origin",
  };
}

function defaultRandomBytes(length: number) {
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}

async function readBoundedBody(request: Request, maxBytes: number) {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function handleLibreSendRelayRequest(request: Request, config: LibreSendRelayConfig): Promise<Response> {
  const now = config.now?.() ?? Date.now();
  const maxBytes = Math.min(Math.max(config.maxBytes ?? LIBRESEND_RELAY_DEFAULT_MAX_FILE_BYTES, 1024), 200 * 1024 * 1024);
  const ttlSeconds = Math.min(Math.max(config.ttlSeconds ?? LIBRESEND_RELAY_DEFAULT_TTL_SECONDS, 60), 24 * 60 * 60);
  const modules = config.modules ?? [];
  validateModules(modules);
  const cors = originHeaders(request, config.allowedOrigins ?? [], config.allowedHeaders ?? []);
  if (!cors) return json({ error: "Origin not allowed." }, 403);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  const url = new URL(request.url);
  if (url.pathname === "/v1/status" && request.method === "GET") {
    return json({
      protocol: LIBRESEND_RELAY_PROTOCOL,
      maxBytes,
      ttlSeconds,
      encryption: "client-side AES-256-GCM",
      retrieval: "single-use",
      storage: config.storageName ?? (config.store instanceof MemoryLibreSendRelayStore ? "memory" : "adapter"),
      modules: modules.map((extension) => extension.id),
      moduleDetails: modules.map((extension) => ({
        id: extension.id,
        version: extension.version ?? null,
        capabilities: extension.capabilities ?? [],
      })),
      hostExtension: config.hostExtension ?? null,
      capabilities: config.publicCapabilities ?? {},
    }, 200, cors);
  }

  if (config.allowRequest && !(await config.allowRequest(request))) {
    return json({ error: "Request limit reached." }, 429, { ...cors, "retry-after": "60" });
  }
  if (!(await modulesAllowRequest(request, modules))) return json({ error: "Request not authorised." }, 403, cors);

  if (url.pathname === "/v1/transfers" && request.method === "POST") {
    if (request.headers.get("x-libresend-version") !== LIBRESEND_RELAY_PROTOCOL) {
      return json({ error: "Unsupported LibreSend protocol version." }, 400, cors);
    }
    if (request.headers.get("content-type")?.split(";", 1)[0].trim() !== "application/octet-stream") {
      return json({ error: "Encrypted binary envelope required." }, 415, cors);
    }
    const declaredLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      return json({ error: `Transfer exceeds the ${maxBytes} byte relay limit.` }, 413, cors);
    }
    const body = await readBoundedBody(request, maxBytes);
    if (!body) return json({ error: `Transfer exceeds the ${maxBytes} byte relay limit.` }, 413, cors);
    if (!isLibreSendEnvelope(body)) return json({ error: "Invalid LibreSend encrypted envelope." }, 400, cors);

    await config.store.prune(now);
    const id = randomId(config.randomBytes ?? defaultRandomBytes);
    const expiresAt = now + ttlSeconds * 1000;
    try {
      await config.store.put({ id, body, createdAt: now, expiresAt });
    } catch (error) {
      if (error instanceof LibreSendRelayCapacityError) return json({ error: "Relay storage is at capacity." }, 503, { ...cors, "retry-after": "60" });
      throw error;
    }
    await emitRelayEvent(modules, { type: "transfer.stored", transferId: id, bytes: body.byteLength, occurredAt: now, expiresAt });
    return json({ id, expiresAt: new Date(expiresAt).toISOString(), singleUse: true }, 201, cors);
  }

  const match = url.pathname.match(/^\/v1\/transfers\/([A-Za-z0-9_-]+)$/);
  if (match && request.method === "GET") {
    const id = match[1];
    if (!transferIdPattern.test(id)) return json({ error: "Invalid transfer identifier." }, 400, cors);
    const value = await config.store.take(id, now);
    if (!value) {
      await emitRelayEvent(modules, { type: "transfer.missed", transferId: id, occurredAt: now });
      return json({ error: "Transfer not found, expired, or already received." }, 404, cors);
    }
    await emitRelayEvent(modules, { type: "transfer.received", transferId: id, bytes: value.body.byteLength, occurredAt: now });
    return new Response(value.body.slice().buffer, {
      status: 200,
      headers: {
        ...cors,
        "content-type": "application/octet-stream",
        "content-length": String(value.body.byteLength),
        "cache-control": "no-store",
        "content-security-policy": "default-src 'none'; sandbox",
        "x-content-type-options": "nosniff",
        "x-libresend-version": LIBRESEND_RELAY_PROTOCOL,
      },
    });
  }

  return json({ error: "Not found." }, 404, cors);
}
