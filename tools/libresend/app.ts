#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { createWriteStream, realpathSync } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  checkReaderFile,
  LIBRESEND_MAX_FILE_BYTES,
} from "../../lib/libresend/core.ts";
import {
  createLibreSendWifiBridge,
  type LibreSendWifiBridge,
} from "../libresend-wifi/bridge.ts";

const DEFAULT_TTL_MS = 15 * 60 * 1_000;

export type LibreSendLocalAppOptions = {
  controlHost?: string;
  controlPort?: number;
  receiveHost?: string;
  receivePort?: number;
  ttlMs?: number;
  controlToken?: string;
  openBrowser?: boolean;
};

export type LibreSendLocalApp = {
  server: Server;
  url: string;
  close(): Promise<void>;
};

type ActiveTransfer = {
  bridge: LibreSendWifiBridge;
  filePath: string;
  expiry: ReturnType<typeof setTimeout>;
};

function securityHeaders() {
  return {
    "cache-control": "no-store",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
  };
}

function json(response: import("node:http").ServerResponse, value: unknown, status = 200) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    ...securityHeaders(),
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  response.end(body);
}

function safeFileName(value: string) {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    throw new Error("The filename is invalid.");
  }
  const name = [...basename(decoded.replaceAll("\\", "/"))]
    .filter((character) => character.charCodeAt(0) > 31 && character.charCodeAt(0) !== 127)
    .join("")
    .trim();
  if (!name || name.length > 180) throw new Error("The filename is invalid.");
  return name;
}

function localAppHtml(basePath: string) {
  const apiPath = `${basePath}api`;
  return `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>LibreSend Local</title>
<style>
:root{color-scheme:light;--paper:#f1eee5;--card:#fbfaf5;--ink:#183126;--muted:#68716b;--line:#d1cdc1;--soft:#e4dfd3}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.5 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}button,input{font:inherit}main{width:min(920px,calc(100% - 32px));margin:0 auto;padding:34px 0 60px}.top{padding:34px 0 28px;display:grid;grid-template-columns:1fr auto;align-items:end;gap:24px;border-bottom:1px solid var(--line)}.eyebrow,.step{margin:0 0 8px;color:var(--muted);font-size:10px;font-weight:700;letter-spacing:.14em}.top h1{margin:0;font:600 clamp(44px,9vw,78px)/.9 Georgia,serif;letter-spacing:-.055em}.top>p{max-width:360px;margin:0;color:var(--muted)}.privacy{margin:14px 0 0;padding:11px 0;display:flex;gap:9px 18px;flex-wrap:wrap;border-bottom:1px solid var(--line);color:var(--muted);font-size:11px}.privacy strong{color:var(--ink);font-weight:600}.panel{padding:30px 0;border-bottom:1px solid var(--line)}.panel h2{margin:0 0 18px;font:500 30px/1.05 Georgia,serif}.drop{min-height:190px;padding:26px;display:grid;place-content:center;justify-items:center;gap:9px;border:1px dashed #8a8d87;border-radius:8px;background:rgba(255,255,255,.32);text-align:center;cursor:pointer}.drop:hover,.drop.drag{background:var(--card);border-color:var(--ink)}.drop input{position:absolute;width:1px;height:1px;clip-path:inset(50%)}.drop b{width:46px;height:46px;display:grid;place-items:center;border-radius:50%;background:var(--ink);color:white;font-size:20px}.drop strong{font-size:15px}.drop span{color:var(--muted);font-size:11px}.status{min-height:20px;margin:12px 0 0;color:var(--muted);font-size:12px}.status.error{color:#8b332b}.transfer{display:none;margin-top:20px;padding:22px;border:1px solid var(--line);border-radius:8px;background:var(--card)}.transfer.show{display:block}.file{display:flex;align-items:center;justify-content:space-between;gap:18px;padding-bottom:16px;border-bottom:1px solid var(--line)}.file strong{overflow-wrap:anywhere}.file span{color:var(--muted);font-size:11px}.address{margin:17px 0 0;padding:13px 14px;display:block;overflow:auto;border:1px solid var(--line);border-radius:3px;background:white;color:var(--ink);font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:nowrap}.actions{margin-top:9px;display:flex;gap:7px;flex-wrap:wrap}.actions button,.actions a,.stop{min-height:40px;padding:9px 13px;border:1px solid var(--ink);border-radius:3px;background:var(--ink);color:white;font-size:11px;font-weight:600;text-decoration:none;cursor:pointer}.actions .secondary,.stop{background:transparent;color:var(--ink)}.routes{margin-top:22px;display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid var(--line);border-left:1px solid var(--line)}.routes article{padding:16px;border-right:1px solid var(--line);border-bottom:1px solid var(--line)}.routes h3{margin:0 0 7px;font:500 19px Georgia,serif}.routes p{margin:0;color:var(--muted);font-size:11px}.routes a{color:var(--ink);font-weight:600}.fine{margin:16px 0 0;color:var(--muted);font-size:10px}.stop{margin-top:22px}.closed{display:none;margin-top:22px;padding:18px;border:1px solid var(--line);background:var(--card)}
@media(max-width:650px){main{width:min(100% - 24px,520px);padding-top:12px}.top{grid-template-columns:1fr;gap:16px}.top h1{font-size:52px}.panel{padding:25px 0}.drop{min-height:170px}.routes{grid-template-columns:1fr}.actions{display:grid}.actions>*{width:100%;text-align:center}}
@media(prefers-color-scheme:dark){:root{color-scheme:dark;--paper:#17221d;--card:#1f2b25;--ink:#edf0e9;--muted:#aeb8b0;--line:#3d4b43;--soft:#2c3932}.address{background:#111b16}}
</style></head><body><main>
<header class="top"><div><p class="eyebrow">FIRST-PARTY LOCAL APP</p><h1>LibreSend</h1></div><p>Choose one book here. Open the private address on a phone, Kobo or OPDS reader app.</p></header>
<div class="privacy"><span><strong>Localhost control</strong> only</span><span><strong>No cloud</strong> upload</span><span><strong>15-minute</strong> link</span><span><strong>One file</strong> exposed</span></div>
<section class="panel" id="workspace"><p class="step">01 · CHOOSE THE BOOK</p><h2>Send over this Wi-Fi</h2>
<label class="drop" id="drop"><input id="file" type="file" accept=".epub,.pdf,.mobi,application/epub+zip,application/pdf,application/x-mobipocket-ebook"><b aria-hidden="true">↥</b><strong>Select EPUB, PDF or MOBI</strong><span>Or drop one file here · 200 MB maximum</span></label>
<p class="status" id="status" role="status" aria-live="polite">The file moves from this browser to the LibreSend process on this computer, never to the internet.</p>
<div class="transfer" id="transfer"><div class="file"><div><strong id="name"></strong><br><span id="meta"></span></div><span id="countdown"></span></div>
<code class="address" id="address"></code><div class="actions"><button id="copy" type="button">Copy address</button><button class="secondary" id="share" type="button">Share address</button><a class="secondary" id="open" target="_blank" rel="noreferrer">Open test page</a></div>
<code class="address" id="opds"></code><div class="actions"><button class="secondary" id="copy-opds" type="button">Copy OPDS address</button><button class="secondary" id="remove" type="button">Remove book</button></div>
<div class="routes"><article><h3>Phone or tablet</h3><p>Open the address, download, then choose Books, Kindle, KOReader or another reading app.</p></article><article><h3>Kindle</h3><p>Use the Kindle app share route, or <a href="https://www.amazon.co.uk/sendtokindle" target="_blank" rel="noreferrer">open Amazon Send to Kindle</a> and select the same EPUB/PDF. The LAN link is not a Kindle import API.</p></article><article><h3>Kobo</h3><p>Type the address in the Kobo browser. If that model cannot download it, use the official USB fallback.</p></article><article><h3>Reader app</h3><p>Add the OPDS address as a custom catalogue, then download the single listed book.</p></article></div>
<p class="fine">The address works only while this program is open and both devices are on the same trusted network. Local HTTP is not encrypted.</p></div></section>
<button class="stop" id="stop" type="button">Close LibreSend</button><p class="closed" id="closed">LibreSend has stopped. You can close this tab.</p>
</main><script>
const API=${JSON.stringify(apiPath)};const fileInput=document.querySelector('#file');const drop=document.querySelector('#drop');const status=document.querySelector('#status');const transfer=document.querySelector('#transfer');let active=null,timer=null;
function size(bytes){return bytes<1048576?Math.max(1,Math.round(bytes/1024))+' KB':(bytes/1048576).toFixed(bytes>=10485760?0:1)+' MB'}
function message(text,error=false){status.textContent=text;status.classList.toggle('error',error)}
async function request(path,options){const response=await fetch(API+path,options);const value=await response.json().catch(()=>({error:'LibreSend did not return a valid response.'}));if(!response.ok)throw new Error(value.error||'LibreSend could not complete that action.');return value}
function render(value){active=value.active||null;transfer.classList.toggle('show',Boolean(active));if(!active){if(timer)clearInterval(timer);return}document.querySelector('#name').textContent=active.fileName;document.querySelector('#meta').textContent=active.format+' · '+size(active.size);document.querySelector('#address').textContent=active.addresses[0]||'No LAN address was found.';document.querySelector('#opds').textContent=active.opdsAddresses[0]||'No OPDS address was found.';document.querySelector('#open').href=active.addresses[0]||'#';const tick=()=>{const left=Math.max(0,new Date(active.expiresAt).getTime()-Date.now());document.querySelector('#countdown').textContent=left?Math.ceil(left/60000)+' min left':'Expired';if(!left){clearInterval(timer);active=null;transfer.classList.remove('show')}};tick();if(timer)clearInterval(timer);timer=setInterval(tick,1000)}
async function upload(file){if(!file)return;message('Preparing '+file.name+'…');try{const value=await request('/file',{method:'PUT',headers:{'content-type':file.type||'application/octet-stream','x-libresend-file-name':encodeURIComponent(file.name),'x-libresend-file-size':String(file.size)},body:file});render(value);message('Ready. Open the address on the receiving device.')}catch(error){message(error.message||'The file could not be prepared.',true)}finally{fileInput.value=''}}
fileInput.addEventListener('change',()=>upload(fileInput.files[0]));['dragenter','dragover'].forEach(name=>drop.addEventListener(name,event=>{event.preventDefault();drop.classList.add('drag')}));['dragleave','drop'].forEach(name=>drop.addEventListener(name,event=>{event.preventDefault();drop.classList.remove('drag')}));drop.addEventListener('drop',event=>upload(event.dataTransfer.files[0]));
async function copy(value,label){try{await navigator.clipboard.writeText(value);message(label+' copied.')}catch{message('Copy was blocked. Select the address manually.',true)}}
document.querySelector('#copy').addEventListener('click',()=>active&&copy(active.addresses[0],'Address'));document.querySelector('#copy-opds').addEventListener('click',()=>active&&copy(active.opdsAddresses[0],'OPDS address'));document.querySelector('#share').addEventListener('click',async()=>{if(!active)return;if(navigator.share){try{await navigator.share({title:'LibreSend · '+active.fileName,url:active.addresses[0]});return}catch(error){if(error.name==='AbortError')return}}copy(active.addresses[0],'Address')});
document.querySelector('#remove').addEventListener('click',async()=>{try{render(await request('/file',{method:'DELETE'}));message('Book removed. Choose another when ready.')}catch(error){message(error.message,true)}});
document.querySelector('#stop').addEventListener('click',async()=>{try{await request('/stop',{method:'POST'});document.querySelector('#workspace').hidden=true;document.querySelector('#stop').hidden=true;document.querySelector('#closed').style.display='block'}catch(error){message(error.message,true)}});
request('/status').then(render).catch(error=>message(error.message,true));
</script></body></html>`;
}

function boundedBody(expectedBytes: number) {
  let received = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length;
      if (received > expectedBytes || received > LIBRESEND_MAX_FILE_BYTES) {
        callback(new Error("The upload exceeded its declared size."));
        return;
      }
      callback(null, chunk);
    },
    flush(callback) {
      callback(received === expectedBytes ? undefined : new Error("The upload was incomplete."));
    },
  });
}

function openLocalBrowser(url: string) {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd.exe" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.once("error", () => undefined);
    child.unref();
  } catch {
    // The printed localhost URL remains available when no desktop opener exists.
  }
}

async function closeServer(server: Server) {
  if (!server.listening) return;
  await new Promise<void>((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
}

export async function createLibreSendLocalApp(options: LibreSendLocalAppOptions = {}): Promise<LibreSendLocalApp> {
  const controlHost = options.controlHost ?? "127.0.0.1";
  if (!new Set(["127.0.0.1", "::1", "localhost"]).has(controlHost)) throw new Error("LibreSend control must remain on localhost.");
  const receiveHost = options.receiveHost ?? "0.0.0.0";
  const receivePort = options.receivePort ?? 0;
  const ttlMs = Math.min(Math.max(options.ttlMs ?? DEFAULT_TTL_MS, 60_000), 24 * 60 * 60 * 1_000);
  const controlToken = options.controlToken ?? randomBytes(18).toString("base64url");
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(controlToken)) throw new Error("LibreSend control token is invalid.");
  const basePath = `/control/${controlToken}/`;
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "libresend-local-"));
  let active: ActiveTransfer | null = null;
  let closing = false;

  async function removeActive() {
    const current = active;
    active = null;
    if (!current) return;
    clearTimeout(current.expiry);
    await current.bridge.close().catch(() => undefined);
    await rm(current.filePath, { force: true });
  }

  function statusValue() {
    if (!active) return { active: null };
    return {
      active: {
        fileName: active.bridge.fileName,
        format: active.bridge.format,
        size: active.bridge.size,
        expiresAt: active.bridge.expiresAt,
        addresses: active.bridge.addresses,
        opdsAddresses: active.bridge.opdsAddresses,
      },
    };
  }

  async function receiveFile(request: IncomingMessage) {
    const encodedName = request.headers["x-libresend-file-name"];
    const sizeHeader = request.headers["x-libresend-file-size"];
    if (typeof encodedName !== "string" || typeof sizeHeader !== "string") throw new Error("Choose one local file in the LibreSend page.");
    const fileName = safeFileName(encodedName);
    const size = Number(sizeHeader);
    const contentLength = request.headers["content-length"];
    if (typeof contentLength === "string" && Number(contentLength) !== size) throw new Error("The upload size did not match the selected file.");
    const type = typeof request.headers["content-type"] === "string" ? request.headers["content-type"] : "";
    const checked = checkReaderFile({ name: fileName, size, type });
    if (!checked.ok) throw new Error(checked.reason);
    const filePath = join(temporaryDirectory, `${randomBytes(8).toString("hex")}-${fileName}`);
    try {
      await pipeline(request, boundedBody(size), createWriteStream(filePath, { flags: "wx", mode: 0o600 }));
      if ((await stat(filePath)).size !== size) throw new Error("The upload was incomplete.");
      await removeActive();
      const bridge = await createLibreSendWifiBridge({ filePath, displayName: fileName, host: receiveHost, port: receivePort, ttlMs });
      const expiry = setTimeout(() => void removeActive(), ttlMs);
      expiry.unref();
      active = { bridge, filePath, expiry };
    } catch (error) {
      await rm(filePath, { force: true });
      throw error;
    }
  }

  const server = createServer((request, response) => {
    void (async () => {
      if (!request.url) {
        json(response, { error: "Not found." }, 404);
        return;
      }
      const url = new URL(request.url, "http://127.0.0.1");
      if (!url.pathname.startsWith(basePath)) {
        json(response, { error: "Not found." }, 404);
        return;
      }
      const route = url.pathname.slice(basePath.length).replace(/\/$/, "");
      if (request.method === "GET" && route === "") {
        const body = localAppHtml(basePath);
        response.writeHead(200, {
          ...securityHeaders(),
          "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
          "content-type": "text/html; charset=utf-8",
          "content-length": Buffer.byteLength(body),
        });
        response.end(body);
        return;
      }
      if (request.method === "GET" && route === "api/status") {
        json(response, statusValue());
        return;
      }
      if (request.method === "PUT" && route === "api/file") {
        await receiveFile(request);
        json(response, statusValue(), 201);
        return;
      }
      if (request.method === "DELETE" && route === "api/file") {
        await removeActive();
        json(response, statusValue());
        return;
      }
      if (request.method === "POST" && route === "api/stop") {
        json(response, { stopped: true });
        setTimeout(() => void close(), 25).unref();
        return;
      }
      json(response, { error: "Not found." }, 404);
    })().catch((error) => {
      if (!response.headersSent) json(response, { error: error instanceof Error ? error.message : "LibreSend could not complete the request." }, 400);
      else response.end();
    });
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(options.controlPort ?? 0, controlHost, () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("LibreSend could not determine its local control port.");
  const url = `http://${controlHost}:${address.port}${basePath}`;

  async function close() {
    if (closing) return;
    closing = true;
    await removeActive();
    await closeServer(server);
    await rm(temporaryDirectory, { recursive: true, force: true });
  }

  if (options.openBrowser !== false) openLocalBrowser(url);
  return { server, url, close };
}

function parsePort(value: string | undefined, label: string) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) throw new Error(`${label} must be a port from 0 to 65535.`);
  return port;
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(`LibreSend Local\n\nUsage: libresend [--no-open] [--port NUMBER] [--receive-port NUMBER]\n\nStarts a private localhost web interface on an available port. Choose one EPUB, PDF or MOBI in the browser, then open the generated address on another device using the same Wi-Fi.`);
    return;
  }
  const option = (name: string) => {
    const index = process.argv.indexOf(name);
    return index === -1 ? undefined : process.argv[index + 1];
  };
  const app = await createLibreSendLocalApp({
    controlPort: option("--port") ? parsePort(option("--port"), "Control port") : undefined,
    receivePort: option("--receive-port") ? parsePort(option("--receive-port"), "Receive port") : undefined,
    openBrowser: !process.argv.includes("--no-open"),
  });
  console.log(`\nLibreSend Local is running:\n\n  ${app.url}\n\nChoose a book in the browser. Press Ctrl+C here to stop.\n`);
  const stop = async () => {
    await app.close();
    process.exit(0);
  };
  process.once("SIGINT", () => void stop());
  process.once("SIGTERM", () => void stop());
}

function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}

if (isMainModule()) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "LibreSend Local could not start.");
    process.exitCode = 1;
  });
}
