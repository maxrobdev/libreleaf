#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { serialiseIndexNdjson } from "../../lib/resolver-index/database.ts";
import { buildResolverSnapshot, type SnapshotQuery } from "../../lib/resolver-index/snapshot.ts";

function option(name: string, fallback?: string) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`--${name} needs a value.`);
  return value;
}

async function main() {
  const endpoint = option("endpoint");
  const queriesPath = option("queries");
  const outputPath = option("output");
  if (!endpoint || !queriesPath || !outputPath) throw new Error("--endpoint, --queries and --output are required.");
  const region = option("region", "GB")!;
  if (region !== "GB" && region !== "US" && region !== "GLOBAL") throw new Error("--region must be GB, US or GLOBAL.");
  const maxPages = Number.parseInt(option("max-pages", "100")!, 10);
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 10_000) throw new Error("--max-pages must be from 1 to 10000.");
  const queries = JSON.parse(readFileSync(resolve(queriesPath), "utf8")) as SnapshotQuery[];
  const result = await buildResolverSnapshot({ endpoint, queries, region, maxPagesPerQuery: maxPages });
  const output = resolve(outputPath);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, serialiseIndexNdjson(result.entries), { mode: 0o600 });
  writeFileSync(`${output}.report.json`, `${JSON.stringify(result.report, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify(result.report, null, 2)}\n`);
  if (!result.report.complete) process.exitCode = 2;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Snapshot failed."}\n`);
  process.exitCode = 1;
});
