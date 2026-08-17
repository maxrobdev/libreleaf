#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseIndexNdjson, ResolverIndex } from "../../lib/resolver-index/database.ts";

type Arguments = { command?: string; values: Map<string, string> };

function parseArguments(argv: string[]): Arguments {
  const [command, ...rest] = argv;
  const values = new Map<string, string>();
  for (let index = 0; index < rest.length; index += 1) {
    const name = rest[index];
    if (!name?.startsWith("--")) throw new Error(`Unexpected argument: ${name ?? ""}`);
    const value = rest[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${name} needs a value.`);
    values.set(name.slice(2), value);
    index += 1;
  }
  return { command, values };
}

function usage() {
  return `LibreLeaf resolver index

Commands:
  init    --db data/resolver-index/libreleaf.sqlite
  ingest  --db <path> --input <snapshot.ndjson> [--source <label>]
  search  --db <path> --query <text> [--limit 24] [--region GB|US|GLOBAL]
  export  --db <path> --format json|csv --output <path>
`;
}

function required(values: Map<string, string>, name: string) {
  const value = values.get(name);
  if (!value) throw new Error(`--${name} is required.`);
  return value;
}

function main() {
  const { command, values } = parseArguments(process.argv.slice(2));
  if (!command || command === "help" || values.has("help")) {
    process.stdout.write(usage());
    return;
  }
  const databasePath = resolve(required(values, "db"));
  const index = new ResolverIndex(databasePath);
  try {
    if (command === "init") {
      process.stdout.write(`${databasePath}\n`);
      return;
    }
    if (command === "ingest") {
      const inputPath = resolve(required(values, "input"));
      const entries = parseIndexNdjson(readFileSync(inputPath, "utf8"));
      const result = index.ingest(entries, values.get("source") ?? inputPath);
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return;
    }
    if (command === "search") {
      const limitValue = values.get("limit");
      const limit = limitValue === undefined ? 24 : Number.parseInt(limitValue, 10);
      if (!Number.isInteger(limit)) throw new Error("--limit must be an integer.");
      const region = values.get("region") ?? "GB";
      if (region !== "GB" && region !== "US" && region !== "GLOBAL") throw new Error("--region must be GB, US or GLOBAL.");
      process.stdout.write(`${JSON.stringify(index.search(values.get("query") ?? "", { limit, region }), null, 2)}\n`);
      return;
    }
    if (command === "export") {
      const format = required(values, "format");
      const output = resolve(required(values, "output"));
      if (format === "json") {
        mkdirSync(dirname(output), { recursive: true });
        writeFileSync(output, index.exportJson(), { mode: 0o600 });
      } else if (format === "csv") {
        mkdirSync(output, { recursive: true });
        for (const [filename, content] of Object.entries(index.exportCsv())) {
          writeFileSync(resolve(output, filename), content, { mode: 0o600 });
        }
      } else {
        throw new Error("--format must be json or csv.");
      }
      process.stdout.write(`${output}\n`);
      return;
    }
    throw new Error(`Unknown command: ${command}`);
  } finally {
    index.close();
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "Resolver index failed."}\n\n${usage()}`);
  process.exitCode = 1;
}
