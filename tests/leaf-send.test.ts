import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  canShareReaderFile,
  checkReaderFile,
  formatReaderFileSize,
  LEAFSEND_MAX_FILE_BYTES,
} from "../lib/leaf-send.ts";

test("accepts bounded EPUB, PDF and MOBI selections without reading file contents", () => {
  assert.deepEqual(checkReaderFile({ name: "book.epub", size: 1_024, type: "application/epub+zip" }), { ok: true, format: "EPUB" });
  assert.deepEqual(checkReaderFile({ name: "paper.PDF", size: 2_048, type: "application/pdf" }), { ok: true, format: "PDF" });
  assert.deepEqual(checkReaderFile({ name: "classic.mobi", size: 4_096, type: "" }), { ok: true, format: "MOBI" });
  assert.deepEqual(checkReaderFile({ name: "classic.mobi", size: 4_096, type: "application/octet-stream" }), { ok: true, format: "MOBI" });

  assert.match(checkReaderFile({ name: "notes.txt", size: 1_024, type: "text/plain" }).reason ?? "", /EPUB, PDF or MOBI/);
  assert.match(checkReaderFile({ name: "empty.pdf", size: 0, type: "application/pdf" }).reason ?? "", /empty/);
  assert.match(checkReaderFile({ name: "huge.epub", size: LEAFSEND_MAX_FILE_BYTES + 1, type: "application/epub+zip" }).reason ?? "", /200 MB/);
  assert.match(checkReaderFile({ name: "mislabelled.epub", size: 1_024, type: "application/pdf" }).reason ?? "", /different file type/);
});

test("formats selected file sizes compactly", () => {
  assert.equal(formatReaderFileSize(1), "1 KB");
  assert.equal(formatReaderFileSize(1_572_864), "1.5 MB");
  assert.equal(formatReaderFileSize(15_728_640), "15 MB");
});

test("requires both Web Share methods and checks the exact file payload", () => {
  const file = { name: "book.epub" } as File;
  let checked: ShareData | undefined;
  const supported = canShareReaderFile({
    share: async () => undefined,
    canShare: (data) => {
      checked = data;
      return true;
    },
  }, file);

  assert.equal(supported, true);
  assert.deepEqual(checked, { files: [file] });
  assert.equal(canShareReaderFile({ canShare: () => true }, file), false);
  assert.equal(canShareReaderFile({ share: async () => undefined, canShare: () => false }, file), false);
  assert.equal(canShareReaderFile({ share: async () => undefined, canShare: () => { throw new Error("blocked"); } }, file), false);
});

test("LeafSend exposes local share/save paths and only official Kindle and Kobo routes", async () => {
  const component = await readFile(new URL("../components/LeafSend.tsx", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/send/page.tsx", import.meta.url), "utf8");
  const navigation = await readFile(new URL("../app/components/SiteNav.tsx", import.meta.url), "utf8");

  assert.match(component, /navigator\.share\(\{ files: \[selected\.file\], title: selected\.file\.name \}\)/);
  assert.match(component, /download=\{selected\.file\.name\}/);
  assert.match(component, /URL\.createObjectURL\(file\)/);
  assert.match(component, /URL\.revokeObjectURL/);
  assert.match(component, /amazon\.co\.uk\/sendtokindle/);
  assert.match(component, /help\.kobo\.com\/hc\/en-us\/articles\/360024775093/);
  assert.match(component, /does not connect to Kindle or Kobo accounts/);
  assert.match(component, /MOBI is not in Amazon/);
  assert.doesNotMatch(component, /fetch\(|XMLHttpRequest|FormData|FileReader|\.arrayBuffer\(/);
  assert.match(page, /alternates: \{ canonical: "\/send" \}/);
  assert.match(navigation, /href: "\/send"/);
});
