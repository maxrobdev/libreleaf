#!/usr/bin/env node
import { resolve } from "node:path";
import { ResolverIndex } from "../../lib/resolver-index/database.ts";
import { createResolverIndexServer } from "../../lib/resolver-index/server.ts";

function option(name: string, fallback?: string) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`--${name} needs a value.`);
  return value;
}

const databasePath = option("db");
if (!databasePath) throw new Error("--db is required.");
const host = option("host", "127.0.0.1")!;
const portText = option("port", "8789")!;
if (!/^\d{1,5}$/.test(portText) || Number(portText) < 1 || Number(portText) > 65_535) throw new Error("--port must be from 1 to 65535.");

const index = new ResolverIndex(resolve(databasePath));
const server = createResolverIndexServer(index);

function close() {
  server.close(() => {
    index.close();
    process.exitCode = 0;
  });
}

process.once("SIGINT", close);
process.once("SIGTERM", close);
server.listen(Number(portText), host, () => {
  process.stdout.write(`LibreLeaf resolver index: http://${host}:${portText}\n`);
  if (host !== "127.0.0.1" && host !== "::1" && host !== "localhost") {
    process.stdout.write("Public bind selected. Put authentication, TLS and rate limiting in the reverse proxy.\n");
  }
});
