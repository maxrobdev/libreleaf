import type {
  LibreSendRelayModule,
  LibreSendRelayStore,
} from "./relay.ts";

export type LibreSendPublicCapability = string | number | boolean;

export type LibreSendHostExtensionContext = {
  allowedOrigins: readonly string[];
  limits: Readonly<{
    maxBytes: number;
    ttlSeconds: number;
    storageMaxBytes: number;
    storageMaxObjects: number;
  }>;
  defaultStorage: Readonly<{
    name: "memory" | "filesystem";
    store: LibreSendRelayStore;
  }>;
};

export type LibreSendHostReadyContext = {
  host: string;
  port: number;
  storage: string;
  modules: readonly string[];
};

/**
 * A trusted, process-level extension for an operator-owned relay.
 *
 * Unlike privacy-bounded relay modules, this code runs with the relay process's
 * privileges. It is deliberately loaded only from a local file at startup.
 */
export type LibreSendHostExtension = {
  id: string;
  modules?: LibreSendRelayModule[];
  store?: LibreSendRelayStore;
  storageName?: string;
  allowRequest?: (request: Request) => boolean | Promise<boolean>;
  allowedHeaders?: string[];
  publicCapabilities?: Record<string, LibreSendPublicCapability>;
  onReady?: (context: LibreSendHostReadyContext) => void | Promise<void>;
  onClose?: () => void | Promise<void>;
};

export type LibreSendHostExtensionFactory = (
  context: LibreSendHostExtensionContext,
) => LibreSendHostExtension | Promise<LibreSendHostExtension>;

const idPattern = /^[a-z][a-z0-9-]{1,40}$/;
const headerPattern = /^[a-z][a-z0-9-]{0,62}$/;
const capabilityPattern = /^[a-z][a-z0-9-]{1,48}$/;

export function defineLibreSendHostExtension(
  extension: LibreSendHostExtension | LibreSendHostExtensionFactory,
) {
  return extension;
}

function validStore(value: unknown): value is LibreSendRelayStore {
  if (!value || typeof value !== "object") return false;
  const store = value as Partial<LibreSendRelayStore>;
  return typeof store.put === "function" && typeof store.take === "function" && typeof store.prune === "function";
}

export function normaliseLibreSendHostExtension(value: unknown): LibreSendHostExtension {
  if (!value || typeof value !== "object") throw new Error("The LibreSend host extension must return an object.");
  const extension = value as Partial<LibreSendHostExtension>;
  if (typeof extension.id !== "string" || !idPattern.test(extension.id)) {
    throw new Error("LibreSend host extension IDs use lowercase letters, numbers and hyphens.");
  }
  if (extension.modules !== undefined && !Array.isArray(extension.modules)) {
    throw new Error("LibreSend host extension modules must be an array.");
  }
  if (extension.store !== undefined && !validStore(extension.store)) {
    throw new Error("A custom LibreSend store must implement put, take and prune.");
  }
  if (extension.store && (typeof extension.storageName !== "string" || !idPattern.test(extension.storageName))) {
    throw new Error("A custom LibreSend store requires a stable storageName.");
  }
  if (extension.storageName && !extension.store) {
    throw new Error("LibreSend storageName cannot be set without a custom store.");
  }
  if (extension.allowRequest !== undefined && typeof extension.allowRequest !== "function") {
    throw new Error("LibreSend allowRequest must be a function.");
  }
  if (extension.onReady !== undefined && typeof extension.onReady !== "function") {
    throw new Error("LibreSend onReady must be a function.");
  }
  if (extension.onClose !== undefined && typeof extension.onClose !== "function") {
    throw new Error("LibreSend onClose must be a function.");
  }

  const allowedHeaders = [...new Set(extension.allowedHeaders ?? [])];
  if (allowedHeaders.length > 16 || allowedHeaders.some((header) => !headerPattern.test(header))) {
    throw new Error("LibreSend custom header names must be lowercase HTTP tokens.");
  }

  const publicCapabilities = extension.publicCapabilities ?? {};
  const capabilityEntries = Object.entries(publicCapabilities);
  if (capabilityEntries.length > 32 || capabilityEntries.some(([key, item]) => (
    !capabilityPattern.test(key)
    || !["string", "number", "boolean"].includes(typeof item)
    || (typeof item === "string" && item.length > 160)
    || (typeof item === "number" && !Number.isFinite(item))
  ))) {
    throw new Error("LibreSend public capabilities must be bounded primitive values with stable keys.");
  }

  return {
    id: extension.id,
    modules: extension.modules ? [...extension.modules] : [],
    store: extension.store,
    storageName: extension.storageName,
    allowRequest: extension.allowRequest,
    allowedHeaders,
    publicCapabilities: Object.fromEntries(capabilityEntries),
    onReady: extension.onReady,
    onClose: extension.onClose,
  };
}
