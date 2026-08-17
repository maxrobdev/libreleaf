import { MemoryLibreSendRelayStore } from "../../lib/libresend/relay.ts";
import { loadLocalLibreSendHostExtension } from "./load-extension.ts";

const extensionPath = process.argv[2]?.trim() || "";
if (!extensionPath) {
  process.stderr.write("Usage: npm run libresend:extension:check -- ./path/to/extension.mjs\n");
  process.exitCode = 2;
} else {
  const store = new MemoryLibreSendRelayStore();
  const extension = await loadLocalLibreSendHostExtension(extensionPath, {
    allowedOrigins: Object.freeze(["http://localhost:3000"]),
    limits: Object.freeze({
      maxBytes: 25 * 1024 * 1024,
      ttlSeconds: 900,
      storageMaxBytes: 2 * 1024 * 1024 * 1024,
      storageMaxObjects: 10_000,
    }),
    defaultStorage: Object.freeze({ name: "memory", store }),
  });
  if (!extension) throw new Error("No LibreSend extension was loaded.");
  process.stdout.write(`${JSON.stringify({
    id: extension.id,
    storage: extension.storageName ?? "default",
    modules: extension.modules?.map((module) => ({
      id: module.id,
      version: module.version ?? null,
      capabilities: module.capabilities ?? [],
    })) ?? [],
    allowedHeaders: extension.allowedHeaders ?? [],
    publicCapabilities: extension.publicCapabilities ?? {},
  }, null, 2)}\n`);
}
