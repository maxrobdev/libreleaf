#!/usr/bin/env node
import { once } from "node:events";
import { createWriteStream, existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { serialiseIndexEntry } from "../../lib/resolver-index/database.ts";
import { harvestDoabOai } from "../../lib/resolver-index/importers/doab-oai.ts";

function option(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`--${name} needs a value.`);
  return value;
}

async function main() {
  const outputValue = option("output");
  const archiveValue = option("archive-dir");
  const fetchedAt = option("fetched-at");
  const until = option("until");
  if (!outputValue || !archiveValue || !fetchedAt || !until) {
    throw new Error("--output, --archive-dir, --fetched-at and --until are required.");
  }
  const from = option("from");
  const maxPagesValue = option("max-pages");
  const maxPages = maxPagesValue === undefined ? undefined : Number.parseInt(maxPagesValue, 10);
  if (maxPages !== undefined && (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 10_000)) {
    throw new Error("--max-pages must be from 1 to 10000.");
  }
  const output = resolve(outputValue);
  const partialOutput = `${output}.partial`;
  const archive = resolve(archiveValue);
  const reportPath = `${output}.report.json`;
  if (existsSync(output) || existsSync(partialOutput) || existsSync(reportPath)) {
    throw new Error(`Refusing to overwrite ${basename(output)}, its partial file or report.`);
  }
  if (existsSync(archive)) throw new Error(`Refusing to reuse archive directory ${archive}.`);
  mkdirSync(dirname(output), { recursive: true });
  mkdirSync(archive, { recursive: true, mode: 0o700 });
  const stream = createWriteStream(partialOutput, { encoding: "utf8", mode: 0o600, flags: "wx" });
  try {
    const report = await harvestDoabOai({
      fetchedAt,
      until,
      ...(from ? { from } : {}),
      ...(maxPages ? { maxPages } : {}),
      async onPage(page, xml, pageNumber) {
        const name = `page-${String(pageNumber).padStart(5, "0")}.xml`;
        writeFileSync(resolve(archive, name), xml, { encoding: "utf8", mode: 0o600, flag: "wx" });
        for (const entry of page.entries) {
          if (!stream.write(serialiseIndexEntry(entry))) await once(stream, "drain");
        }
      },
    });
    stream.end();
    await once(stream, "finish");
    renameSync(partialOutput, output);
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.complete) process.exitCode = 2;
  } catch (error) {
    stream.destroy();
    throw error;
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "DOAB OAI-PMH import failed."}\n`);
  process.exitCode = 1;
});
