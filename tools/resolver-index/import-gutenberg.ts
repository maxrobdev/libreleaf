#!/usr/bin/env node
import { once } from "node:events";
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { serialiseIndexEntry } from "../../lib/resolver-index/database.ts";
import { generateGutenbergCsvEntries } from "../../lib/resolver-index/importers/gutenberg-csv.ts";

function option(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`--${name} needs a value.`);
  return value;
}

async function main() {
  const inputValue = option("input");
  const outputValue = option("output");
  const fetchedAt = option("fetched-at");
  if (!inputValue || !outputValue || !fetchedAt) throw new Error("--input, --output and --fetched-at are required.");
  const maxValue = option("max-records");
  const maxRecords = maxValue === undefined ? undefined : Number.parseInt(maxValue, 10);
  if (maxRecords !== undefined && (!Number.isInteger(maxRecords) || maxRecords < 1 || maxRecords > 250_000)) {
    throw new Error("--max-records must be from 1 to 250000.");
  }
  const input = resolve(inputValue);
  const output = resolve(outputValue);
  const csv = readFileSync(input, "utf8");
  mkdirSync(dirname(output), { recursive: true });
  const stream = createWriteStream(output, { encoding: "utf8", mode: 0o600 });
  const iterator = generateGutenbergCsvEntries(csv, { fetchedAt, ...(maxRecords ? { maxRecords } : {}) });
  let next = iterator.next();
  while (!next.done) {
    if (!stream.write(serialiseIndexEntry(next.value))) await once(stream, "drain");
    next = iterator.next();
  }
  stream.end();
  await once(stream, "finish");
  writeFileSync(`${output}.report.json`, `${JSON.stringify(next.value, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify(next.value, null, 2)}\n`);
  if (!next.value.complete) process.exitCode = 2;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Project Gutenberg import failed."}\n`);
  process.exitCode = 1;
});
