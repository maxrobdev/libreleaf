import { randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type Server, type ServerResponse } from "node:http";
import { hostname, networkInterfaces } from "node:os";
import { basename, resolve } from "node:path";
import { checkReaderFile, formatReaderFileSize, type ReaderFileFormat } from "../../lib/libresend/core.ts";

const TOKEN_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const DEFAULT_TTL_MS = 15 * 60 * 1_000;

export type LibreSendWifiBridgeOptions = {
  filePath: string;
  displayName?: string;
  host?: string;
  port?: number;
  ttlMs?: number;
  token?: string;
};

export type LibreSendWifiBridge = {
  server: Server;
  fileName: string;
  format: ReaderFileFormat;
  size: number;
  token: string;
  expiresAt: string;
  addresses: string[];
  opdsAddresses: string[];
  close(): Promise<void>;
};

function html(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function xml(value: string) {
  return html(value);
}

function makeToken() {
  const bytes = randomBytes(10);
  return Array.from(bytes, (value) => TOKEN_ALPHABET[value % TOKEN_ALPHABET.length]).join("");
}

function validToken(value: string) {
  return /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8,16}$/.test(value);
}

function contentType(format: ReaderFileFormat) {
  if (format === "EPUB") return "application/epub+zip";
  if (format === "PDF") return "application/pdf";
  return "application/x-mobipocket-ebook";
}

function commonHeaders() {
  return {
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
  };
}

function notFound(response: ServerResponse) {
  response.writeHead(404, { ...commonHeaders(), "content-type": "text/plain; charset=utf-8" });
  response.end("Not found.\n");
}

function parseRange(value: string | undefined, size: number) {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match) return false;
  let start = match[1] ? Number(match[1]) : NaN;
  let end = match[2] ? Number(match[2]) : NaN;
  if (Number.isNaN(start) && Number.isNaN(end)) return false;
  if (Number.isNaN(start)) {
    const suffix = Math.min(end, size);
    start = size - suffix;
    end = size - 1;
  } else {
    if (Number.isNaN(end)) end = size - 1;
    end = Math.min(end, size - 1);
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= size) return false;
  return { start, end };
}

function attachmentName(fileName: string) {
  const fallback = fileName.replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 120) || "book";
  return `attachment; filename="${fallback.replace(/["\\]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

function landingPage(fileName: string, format: ReaderFileFormat, size: number, token: string, expiresAt: string) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${html(fileName)} — LibreSend Wi-Fi</title>
<style>body{max-width:38rem;margin:0 auto;padding:3rem 1.25rem;background:#f3f0e8;color:#183126;font:16px/1.55 Arial,sans-serif}main{border-top:4px solid #183126;padding-top:1.5rem}h1{margin:.35rem 0;font:600 2rem/1.05 Georgia,serif;word-wrap:break-word}.meta{color:#667068;font-size:.85rem}.download{margin:1.4rem 0;padding:.8rem 1rem;display:block;background:#183126;color:#fff;text-align:center;text-decoration:none}.small{font-size:.8rem;color:#667068}code{word-wrap:break-word}</style>
</head><body><main><p class="meta">LIBRESEND WI-FI · ${format} · ${html(formatReaderFileSize(size))}</p><h1>${html(fileName)}</h1>
<a class="download" href="/${token}/book" download>Download this book</a>
<p>If your e-reader asks what to do, choose download or open. The file is coming directly from a computer on this Wi-Fi network.</p>
<p class="small">Available until ${html(new Date(expiresAt).toLocaleString("en-GB"))}, or until the bridge is stopped. This page has no scripts and no cloud account.</p>
<p class="small">OPDS-capable apps can use <code>/${token}/opds</code>.</p></main></body></html>`;
}

function opdsFeed(origin: string, fileName: string, format: ReaderFileFormat, size: number, token: string) {
  const updated = new Date().toISOString();
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:opds="http://opds-spec.org/2010/catalog">
  <id>urn:libresend:wifi:${token}</id><title>LibreSend Wi-Fi</title><updated>${updated}</updated>
  <link rel="self" href="${xml(`${origin}/${token}/opds`)}" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
  <entry><id>urn:libresend:wifi:${token}:book</id><title>${xml(fileName)}</title><updated>${updated}</updated>
    <content type="text">${xml(`${format} · ${formatReaderFileSize(size)}`)}</content>
    <link rel="http://opds-spec.org/acquisition/open-access" href="${xml(`${origin}/${token}/book`)}" type="${contentType(format)}"/>
  </entry>
</feed>`;
}

function networkHosts(bindHost: string) {
  if (bindHost !== "0.0.0.0" && bindHost !== "::") return [bindHost];
  const hosts = new Set<string>();
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) hosts.add(entry.address);
    }
  }
  const localName = hostname().replace(/\.local$/i, "").trim();
  if (localName) hosts.add(`${localName}.local`);
  return [...hosts];
}

async function closeServer(server: Server) {
  if (!server.listening) return;
  await new Promise<void>((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
}

export async function createLibreSendWifiBridge(options: LibreSendWifiBridgeOptions): Promise<LibreSendWifiBridge> {
  const filePath = resolve(options.filePath);
  const fileStats = await stat(filePath);
  if (!fileStats.isFile()) throw new Error("Choose one EPUB, PDF or MOBI file.");
  const diskName = basename(filePath);
  const displayName = options.displayName?.trim();
  const fileName = displayName ? basename(displayName.replaceAll("\\", "/")) : diskName;
  if (!fileName || (displayName && fileName !== displayName.replaceAll("\\", "/"))) throw new Error("The display filename is invalid.");
  const checked = checkReaderFile({ name: fileName, size: fileStats.size, type: "" });
  if (!checked.ok) throw new Error(checked.reason);
  const token = options.token ?? makeToken();
  if (!validToken(token)) throw new Error("Wi-Fi bridge tokens use 8–16 unambiguous letters and numbers.");
  const host = options.host ?? "0.0.0.0";
  const ttlMs = Math.min(Math.max(options.ttlMs ?? DEFAULT_TTL_MS, 60_000), 24 * 60 * 60 * 1_000);
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  let port = options.port ?? 8789;

  const server = createServer((request, response) => {
    void (async () => {
      if (!request.url || (request.method !== "GET" && request.method !== "HEAD")) {
        response.writeHead(405, { ...commonHeaders(), allow: "GET, HEAD" });
        response.end();
        return;
      }
      const requestUrl = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);
      const landingPath = `/${token}`;
      const bookPath = `/${token}/book`;
      const opdsPath = `/${token}/opds`;
      if (requestUrl.pathname === landingPath || requestUrl.pathname === `${landingPath}/`) {
        const body = landingPage(fileName, checked.format, fileStats.size, token, expiresAt);
        response.writeHead(200, {
          ...commonHeaders(),
          "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
          "content-type": "text/html; charset=utf-8",
          "content-length": Buffer.byteLength(body),
        });
        response.end(request.method === "HEAD" ? undefined : body);
        return;
      }
      if (requestUrl.pathname === opdsPath) {
        const origin = `http://${request.headers.host ?? `127.0.0.1:${port}`}`;
        const body = opdsFeed(origin, fileName, checked.format, fileStats.size, token);
        response.writeHead(200, {
          ...commonHeaders(),
          "content-type": "application/atom+xml;profile=opds-catalog;kind=acquisition; charset=utf-8",
          "content-length": Buffer.byteLength(body),
        });
        response.end(request.method === "HEAD" ? undefined : body);
        return;
      }
      if (requestUrl.pathname !== bookPath) {
        notFound(response);
        return;
      }
      const range = parseRange(request.headers.range, fileStats.size);
      if (range === false) {
        response.writeHead(416, { ...commonHeaders(), "content-range": `bytes */${fileStats.size}` });
        response.end();
        return;
      }
      const start = range?.start ?? 0;
      const end = range?.end ?? fileStats.size - 1;
      response.writeHead(range ? 206 : 200, {
        ...commonHeaders(),
        "accept-ranges": "bytes",
        "content-type": contentType(checked.format),
        "content-disposition": attachmentName(fileName),
        "content-length": end - start + 1,
        ...(range ? { "content-range": `bytes ${start}-${end}/${fileStats.size}` } : {}),
      });
      if (request.method === "HEAD") {
        response.end();
        return;
      }
      const stream = createReadStream(filePath, { start, end });
      stream.on("error", () => response.destroy());
      stream.pipe(response);
    })().catch(() => {
      if (!response.headersSent) response.writeHead(500, { ...commonHeaders(), "content-type": "text/plain; charset=utf-8" });
      response.end("Transfer failed.\n");
    });
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, host, () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    await closeServer(server);
    throw new Error("LibreSend Wi-Fi could not determine its local port.");
  }
  port = address.port;
  const addresses = networkHosts(host).map((networkHost) => `http://${networkHost}:${port}/${token}`);
  const expiry = setTimeout(() => void closeServer(server), ttlMs);
  expiry.unref();

  return {
    server,
    fileName,
    format: checked.format,
    size: fileStats.size,
    token,
    expiresAt,
    addresses,
    opdsAddresses: addresses.map((value) => `${value}/opds`),
    async close() {
      clearTimeout(expiry);
      await closeServer(server);
    },
  };
}
