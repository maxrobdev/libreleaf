import type { BriefPayload } from "./service.ts";

type EpubFile = { name: string; data: Uint8Array };

const encoder = new TextEncoder();

function xml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function little16(value: number) {
  return new Uint8Array([value & 0xff, value >>> 8 & 0xff]);
}

function little32(value: number) {
  return new Uint8Array([value & 0xff, value >>> 8 & 0xff, value >>> 16 & 0xff, value >>> 24 & 0xff]);
}

function join(parts: Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

function zipStored(files: EpubFile[]) {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;

  for (const file of files) {
    const name = encoder.encode(file.name);
    const crc = crc32(file.data);
    const local = join([
      little32(0x04034b50),
      little16(20),
      little16(0x0800),
      little16(0),
      little16(0),
      little16(0x0021),
      little32(crc),
      little32(file.data.byteLength),
      little32(file.data.byteLength),
      little16(name.byteLength),
      little16(0),
      name,
      file.data,
    ]);
    localParts.push(local);
    centralParts.push(join([
      little32(0x02014b50),
      little16(20),
      little16(20),
      little16(0x0800),
      little16(0),
      little16(0),
      little16(0x0021),
      little32(crc),
      little32(file.data.byteLength),
      little32(file.data.byteLength),
      little16(name.byteLength),
      little16(0),
      little16(0),
      little16(0),
      little16(0),
      little32(0),
      little32(localOffset),
      name,
    ]));
    localOffset += local.byteLength;
  }

  const central = join(centralParts);
  return join([
    ...localParts,
    central,
    little32(0x06054b50),
    little16(0),
    little16(0),
    little16(files.length),
    little16(files.length),
    little32(central.byteLength),
    little32(localOffset),
    little16(0),
  ]);
}

function xhtml(payload: BriefPayload) {
  const items = payload.items.map((item) => {
    const date = item.publishedAt
      ? `<time datetime="${xml(item.publishedAt)}">${xml(new Date(item.publishedAt).toLocaleDateString("en-GB", { dateStyle: "medium", timeZone: "UTC" }))}</time>`
      : "Date not supplied";
    const suppliedText = item.content ?? item.summary;
    const body = suppliedText
      ? suppliedText.split(/\n{2,}/).filter(Boolean).map((paragraph) => `<p>${xml(paragraph).replace(/\n/g, "<br />")}</p>`).join("\n")
      : "";
    return `<article>
      <h2><a href="${xml(item.url)}">${xml(item.title)}</a></h2>
      <p class="source">${xml(item.source.name)} · ${date}</p>
      ${body}
      <p><a href="${xml(item.url)}">Open original reporting</a></p>
    </article>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="en-GB" lang="en-GB">
<head>
  <meta charset="utf-8" />
  <title>${xml(payload.editionTitle)}</title>
  <style>body{font-family:serif;line-height:1.55;max-width:42em;margin:0 auto;padding:1em}h1,h2{line-height:1.15}article{border-top:1px solid #999;padding:1em 0}.source{font-size:.85em;color:#555}a{color:inherit}</style>
</head>
<body>
  <header>
    <h1>${xml(payload.editionTitle)}</h1>
    <p>Generated ${xml(new Date(payload.generatedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }))} UTC.</p>
    <p>This personal reading copy contains text supplied by each publisher's RSS feed. Some feeds contain a full article and others only a summary. Follow each link for the complete current report. Inclusion is not an endorsement.</p>
  </header>
  ${items}
</body>
</html>`;
}

export function buildBriefEpub(payload: BriefPayload) {
  if (!payload.items.length) throw new Error("A Briefleaf EPUB requires at least one feed item.");
  const identifier = `urn:libreleaf:brief:${payload.feedIds.join("+")}:${payload.generatedAt}`;
  const modified = new Date(payload.generatedAt).toISOString().replace(/\.\d{3}Z$/, "Z");
  const title = payload.editionTitle;
  const files: EpubFile[] = [
    { name: "mimetype", data: encoder.encode("application/epub+zip") },
    { name: "META-INF/container.xml", data: encoder.encode(`<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml" /></rootfiles>
</container>`) },
    { name: "EPUB/package.opf", data: encoder.encode(`<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" xml:lang="en-GB">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">${xml(identifier)}</dc:identifier>
    <dc:title>${xml(title)}</dc:title>
    <dc:language>en-GB</dc:language>
    <dc:creator>LibreLeaf Briefleaf</dc:creator>
    <meta property="dcterms:modified">${xml(modified)}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" />
    <item id="brief" href="brief.xhtml" media-type="application/xhtml+xml" />
  </manifest>
  <spine><itemref idref="brief" /></spine>
</package>`) },
    { name: "EPUB/nav.xhtml", data: encoder.encode(`<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en-GB" lang="en-GB">
<head><title>Contents</title></head><body><nav epub:type="toc"><h1>Contents</h1><ol><li><a href="brief.xhtml">${xml(title)}</a></li></ol></nav></body>
</html>`) },
    { name: "EPUB/brief.xhtml", data: encoder.encode(xhtml(payload)) },
  ];
  return zipStored(files);
}

export function briefEpubFilename(payload: Pick<BriefPayload, "editionSlug" | "generatedAt">) {
  return `briefleaf-${payload.editionSlug}-${payload.generatedAt.slice(0, 10)}.epub`;
}
