import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  canShareReaderFile,
  checkReaderFile,
  formatReaderFileSize,
  handoffLink,
  LIBRESEND_MAX_FILE_BYTES,
} from "../lib/libresend/core.ts";
import { decryptReaderFile, encryptReaderFile, isLibreSendEnvelope } from "../lib/libresend/crypto.ts";
import { createEncryptedRelayTransfer, getRelayStatus } from "../lib/libresend/client.ts";
import { normaliseLibreSendHostExtension } from "../lib/libresend/host.ts";
import { handleLibreSendRelayRequest, LibreSendRelayCapacityError, MemoryLibreSendRelayStore } from "../lib/libresend/relay.ts";
import { LibreSendTransportRegistry } from "../lib/libresend/transports.ts";
import { FilesystemLibreSendRelayStore } from "../tools/libresend-relay/filesystem-store.ts";
import { loadLocalLibreSendHostExtension } from "../tools/libresend-relay/load-extension.ts";
import { createLibreSendWifiBridge } from "../tools/libresend-wifi/bridge.ts";
import { createLibreSendLocalApp } from "../tools/libresend/app.ts";

test("LibreSend accepts bounded EPUB, PDF and MOBI selections without reading file contents", () => {
  assert.deepEqual(checkReaderFile({ name: "book.epub", size: 1_024, type: "application/epub+zip" }), { ok: true, format: "EPUB" });
  assert.deepEqual(checkReaderFile({ name: "paper.PDF", size: 2_048, type: "application/pdf" }), { ok: true, format: "PDF" });
  assert.deepEqual(checkReaderFile({ name: "classic.mobi", size: 4_096, type: "" }), { ok: true, format: "MOBI" });
  assert.deepEqual(checkReaderFile({ name: "classic.mobi", size: 4_096, type: "application/octet-stream" }), { ok: true, format: "MOBI" });

  const reason = (candidate: Parameters<typeof checkReaderFile>[0]) => {
    const result = checkReaderFile(candidate);
    return result.ok ? "" : result.reason;
  };
  assert.match(reason({ name: "notes.txt", size: 1_024, type: "text/plain" }), /EPUB, PDF or MOBI/);
  assert.match(reason({ name: "empty.pdf", size: 0, type: "application/pdf" }), /empty/);
  assert.match(reason({ name: "huge.epub", size: LIBRESEND_MAX_FILE_BYTES + 1, type: "application/epub+zip" }), /200 MB/);
  assert.match(reason({ name: "mislabelled.epub", size: 1_024, type: "application/pdf" }), /different file type/);
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

test("shares a lawful route when possible and otherwise copies it", async () => {
  let shared: ShareData | undefined;
  assert.equal(await handoffLink({ share: async (data) => { shared = data; } }, { title: "Book", url: "https://books.example/book" }), "shared");
  assert.deepEqual(shared, { title: "Book", url: "https://books.example/book" });

  let copied = "";
  assert.equal(await handoffLink({ clipboard: { writeText: async (value) => { copied = value; } } }, { title: "Book", url: "https://books.example/book" }), "copied");
  assert.equal(copied, "https://books.example/book");
  assert.equal(await handoffLink({}, { title: "Bad", url: "javascript:alert(1)" }), "unavailable");
});

test("encrypts the complete reader file and rejects a changed envelope", async () => {
  const original = new File(["A private test edition."], "edition.epub", { type: "application/epub+zip" });
  const encrypted = await encryptReaderFile(original);
  assert.equal(isLibreSendEnvelope(encrypted.envelope), true);
  assert.doesNotMatch(new TextDecoder().decode(encrypted.envelope), /private test edition/);

  const restored = await decryptReaderFile(encrypted.envelope, encrypted.key);
  assert.equal(restored.name, "edition.epub");
  assert.equal(restored.type, "application/epub+zip");
  assert.equal(new TextDecoder().decode(restored.bytes), "A private test edition.");

  const changed = encrypted.envelope.slice();
  changed[changed.length - 1] ^= 1;
  await assert.rejects(decryptReaderFile(changed, encrypted.key), /could not be decrypted/);
});

test("portable relay stores only a bounded envelope and deletes it on first retrieval", async () => {
  const file = new File(["one use"], "one-use.epub", { type: "application/epub+zip" });
  const encrypted = await encryptReaderFile(file);
  const store = new MemoryLibreSendRelayStore();
  const config = {
    store,
    now: () => Date.parse("2026-08-17T12:00:00Z"),
    randomBytes: (length: number) => new Uint8Array(length).fill(7),
  };
  const upload = await handleLibreSendRelayRequest(new Request("https://relay.example/v1/transfers", {
    method: "POST",
    headers: { "content-type": "application/octet-stream", "x-libresend-version": "1" },
    body: encrypted.envelope.slice().buffer,
  }), config);
  assert.equal(upload.status, 201);
  const uploaded = await upload.json() as { id: string; singleUse: boolean };
  assert.match(uploaded.id, /^[A-Za-z0-9_-]{24}$/);
  assert.equal(uploaded.singleUse, true);

  const first = await handleLibreSendRelayRequest(new Request(`https://relay.example/v1/transfers/${uploaded.id}`), config);
  assert.equal(first.status, 200);
  assert.deepEqual(new Uint8Array(await first.arrayBuffer()), encrypted.envelope);
  const second = await handleLibreSendRelayRequest(new Request(`https://relay.example/v1/transfers/${uploaded.id}`), config);
  assert.equal(second.status, 404);
});

test("portable receive links carry a custom relay only in the fragment", async () => {
  const file = new File(["portable"], "portable.epub", { type: "application/epub+zip" });
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/v1/status")) {
      return Response.json({ protocol: "1", maxBytes: 1024 * 1024, ttlSeconds: 900, encryption: "client-side AES-256-GCM", retrieval: "single-use", storage: "filesystem", modules: [] });
    }
    assert.equal(init?.method, "POST");
    return Response.json({ id: "A".repeat(24), expiresAt: "2026-08-17T12:15:00.000Z", singleUse: true }, { status: 201 });
  };
  const transfer = await createEncryptedRelayTransfer({ file, relayUrl: "https://send.example.org", appUrl: "https://books.example", fetcher });
  const receive = new URL(transfer.receiveUrl);
  assert.equal(receive.searchParams.get("receive"), "A".repeat(24));
  assert.equal(receive.searchParams.has("relay"), false);
  const fragment = new URLSearchParams(receive.hash.slice(1));
  assert.equal(fragment.get("relay"), "https://send.example.org");
  assert.match(fragment.get("key") ?? "", /^[A-Za-z0-9_-]+$/);
});

test("filesystem storage survives a process boundary and claims a transfer once", async () => {
  const directory = await mkdtemp(join(tmpdir(), "libresend-store-"));
  try {
    const id = "B".repeat(24);
    const firstProcess = new FilesystemLibreSendRelayStore({ directory, maxObjects: 4, maxBytes: 4096 });
    await firstProcess.put({ id, body: new Uint8Array([1, 2, 3]), createdAt: 10, expiresAt: 100 });

    const secondProcess = new FilesystemLibreSendRelayStore({ directory, maxObjects: 4, maxBytes: 4096 });
    const [firstClaim, secondClaim] = await Promise.all([firstProcess.take(id, 20), secondProcess.take(id, 20)]);
    const successful = [firstClaim, secondClaim].filter((value) => value !== null);
    assert.equal(successful.length, 1);
    assert.deepEqual(successful[0]?.body, new Uint8Array([1, 2, 3]));
    assert.equal(await secondProcess.take(id, 20), null);

    await secondProcess.put({ id: "C".repeat(24), body: new Uint8Array([4]), createdAt: 10, expiresAt: 15 });
    assert.equal(await secondProcess.prune(20), 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("relay modules authorise transfer routes and receive metadata-only lifecycle events", async () => {
  const events: Array<{ type: string; bytes?: number }> = [];
  const store = new MemoryLibreSendRelayStore();
  const extension = {
    id: "test-policy",
    version: "1.2.0",
    capabilities: ["aggregate-events"],
    authorize: ({ origin }: { origin: string | null }) => origin === "https://books.example",
    onEvent: (event: { type: string; bytes?: number }) => { events.push({ type: event.type, bytes: event.bytes }); },
  };
  const status = await handleLibreSendRelayRequest(new Request("https://relay.example/v1/status"), {
    store,
    modules: [extension],
    storageName: "test",
    hostExtension: "test-host",
    publicCapabilities: { profile: "community" },
  });
  assert.deepEqual(await status.json(), {
    protocol: "1",
    maxBytes: 26214400,
    ttlSeconds: 900,
    encryption: "client-side AES-256-GCM",
    retrieval: "single-use",
    storage: "test",
    modules: ["test-policy"],
    moduleDetails: [{ id: "test-policy", version: "1.2.0", capabilities: ["aggregate-events"] }],
    hostExtension: "test-host",
    capabilities: { profile: "community" },
  });

  const encrypted = await encryptReaderFile(new File(["module"], "module.epub", { type: "application/epub+zip" }));
  const denied = await handleLibreSendRelayRequest(new Request("https://relay.example/v1/transfers", {
    method: "POST",
    headers: { "content-type": "application/octet-stream", "x-libresend-version": "1", origin: "https://wrong.example" },
    body: encrypted.envelope.slice().buffer,
  }), { store, modules: [extension], allowedOrigins: ["https://wrong.example"] });
  assert.equal(denied.status, 403);

  const config = {
    store,
    modules: [extension],
    allowedOrigins: ["https://books.example"],
    randomBytes: (length: number) => new Uint8Array(length).fill(8),
    now: () => 100,
  };
  const upload = await handleLibreSendRelayRequest(new Request("https://relay.example/v1/transfers", {
    method: "POST",
    headers: { "content-type": "application/octet-stream", "x-libresend-version": "1", origin: "https://books.example" },
    body: encrypted.envelope.slice().buffer,
  }), config);
  const id = (await upload.json() as { id: string }).id;
  await handleLibreSendRelayRequest(new Request(`https://relay.example/v1/transfers/${id}`, { headers: { origin: "https://books.example" } }), config);
  assert.deepEqual(events.map((event) => event.type), ["transfer.stored", "transfer.received"]);
  assert.equal(events.every((event) => typeof event.bytes === "number"), true);
});

test("loads a trusted local host extension and rejects remote extension URLs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "libresend-extension-"));
  const store = new MemoryLibreSendRelayStore();
  const context = {
    allowedOrigins: ["https://books.example"],
    limits: { maxBytes: 4096, ttlSeconds: 300, storageMaxBytes: 8192, storageMaxObjects: 8 },
    defaultStorage: { name: "memory" as const, store },
  };
  try {
    const modulePath = join(directory, "relay-extension.mjs");
    await writeFile(modulePath, `
      export default (context) => ({
        id: "test-host",
        modules: [{ id: "test-events", version: "1.0.0", capabilities: ["aggregate-events"] }],
        publicCapabilities: { profile: context.defaultStorage.name, max: context.limits.maxBytes }
      });
    `, "utf8");
    const loaded = await loadLocalLibreSendHostExtension(modulePath, context);
    assert.equal(loaded?.id, "test-host");
    assert.deepEqual(loaded?.modules?.map((module) => module.id), ["test-events"]);
    assert.deepEqual(loaded?.publicCapabilities, { profile: "memory", max: 4096 });
    await assert.rejects(
      loadLocalLibreSendHostExtension("https://mods.example/relay.mjs", context),
      /local file path/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("validates privileged custom stores, headers and public capabilities", () => {
  const store = new MemoryLibreSendRelayStore();
  const extension = normaliseLibreSendHostExtension({
    id: "custom-host",
    store,
    storageName: "custom-store",
    allowedHeaders: ["x-community-token", "x-community-token"],
    publicCapabilities: { profile: "private", replicas: 1 },
  });
  assert.equal(extension.store, store);
  assert.deepEqual(extension.allowedHeaders, ["x-community-token"]);
  assert.throws(
    () => normaliseLibreSendHostExtension({ id: "custom-host", store }),
    /storageName/,
  );
  assert.throws(
    () => normaliseLibreSendHostExtension({ id: "custom-host", publicCapabilities: { secret: {} } }),
    /bounded primitive/,
  );
});

test("relay enforces exact origins, envelope type, size and expiry bounds", async () => {
  const store = new MemoryLibreSendRelayStore();
  const forbidden = await handleLibreSendRelayRequest(new Request("https://relay.example/v1/status", { headers: { origin: "https://wrong.example" } }), {
    store,
    allowedOrigins: ["https://books.example"],
  });
  assert.equal(forbidden.status, 403);

  const invalid = await handleLibreSendRelayRequest(new Request("https://relay.example/v1/transfers", {
    method: "POST",
    headers: { "content-type": "application/octet-stream", "x-libresend-version": "1", origin: "https://books.example" },
    body: new Uint8Array(64).buffer,
  }), { store, allowedOrigins: ["https://books.example"] });
  assert.equal(invalid.status, 400);

  const oversized = await handleLibreSendRelayRequest(new Request("https://relay.example/v1/transfers", {
    method: "POST",
    headers: { "content-type": "application/octet-stream", "x-libresend-version": "1" },
    body: new Uint8Array(2048).buffer,
  }), { store, maxBytes: 1024 });
  assert.equal(oversized.status, 413);
});

test("checks relay capabilities before encrypting or uploading a large file", async () => {
  let requests = 0;
  const fetcher: typeof fetch = async () => {
    requests += 1;
    return Response.json({ protocol: "1", maxBytes: 1024, ttlSeconds: 900, encryption: "client-side AES-256-GCM", retrieval: "single-use" });
  };
  assert.equal((await getRelayStatus("https://relay.example", fetcher)).maxBytes, 1024);
  await assert.rejects(createEncryptedRelayTransfer({
    file: new File([new Uint8Array(2048)], "large.epub", { type: "application/epub+zip" }),
    relayUrl: "https://relay.example",
    appUrl: "https://books.example",
    fetcher,
  }), /accepts files up to 1 KB/);
  assert.equal(requests, 2, "each operation made only its capability request; no upload followed");
});

test("bounded memory storage evicts oldest ciphertext and rejects an impossible object", async () => {
  const store = new MemoryLibreSendRelayStore({ maxObjects: 1, maxBytes: 1024 });
  await store.put({ id: "a", body: new Uint8Array(32), createdAt: 1, expiresAt: 100 });
  await store.put({ id: "b", body: new Uint8Array(32), createdAt: 2, expiresAt: 100 });
  assert.equal(await store.take("a", 3), null);
  assert.equal((await store.take("b", 3))?.id, "b");
  await assert.rejects(
    store.put({ id: "c", body: new Uint8Array(1025), createdAt: 3, expiresAt: 100 }),
    LibreSendRelayCapacityError,
  );
});

test("custom transports register explicitly and cannot silently replace one another", async () => {
  const transport = {
    id: "test-link",
    label: "Test link",
    available: () => true,
    send: async () => ({ transport: "test-link", status: "sent" as const }),
  };
  const registry = new LibreSendTransportRegistry([transport]);
  const payload = { kind: "link" as const, title: "Book", url: "https://books.example/book" };
  const context = { navigator: {} as Navigator };
  assert.deepEqual(registry.available(payload, context).map((item) => item.id), ["test-link"]);
  assert.deepEqual(await registry.send("test-link", payload, context), { transport: "test-link", status: "sent" });
  assert.throws(() => registry.register(transport), /already registered/);
});

test("LibreSend exposes local and optional encrypted paths plus official device routes", async () => {
  const component = await readFile(new URL("../components/LibreSend.tsx", import.meta.url), "utf8");
  const routes = await readFile(new URL("../components/LibreSendRoute.tsx", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/send/page.tsx", import.meta.url), "utf8");
  const navigation = await readFile(new URL("../app/components/SiteNav.tsx", import.meta.url), "utf8");

  assert.match(component, /navigator\.share\(\{ files: \[selected\.file\], title: selected\.file\.name \}\)/);
  assert.match(routes, /download=\{fileName\}/);
  assert.match(component, /URL\.createObjectURL\(file\)/);
  assert.match(component, /URL\.revokeObjectURL/);
  assert.match(routes, /amazon\.co\.uk\/sendtokindle/);
  assert.match(routes, /help\.kobo\.com\/hc\/en-us\/articles\/360024775093/);
  assert.match(routes, /15335985512983-Add-books-to-your-eReader-using-Google-Drive/);
  assert.match(routes, /360033830114-Add-books-to-your-eReader-using-Dropbox/);
  assert.match(routes, /MOBI/);
  assert.match(routes, /npx --yes github:maxrobdev\/libreleaf/);
  assert.match(routes, /OPDS/);
  assert.match(component, /LIBRESEND_DESTINATIONS/);
  assert.match(component, /createEncryptedRelayTransfer/);
  assert.match(component, /receiveEncryptedRelayTransfer/);
  assert.match(component, /relayEndpoint \? "Connected" : "Off"/);
  assert.match(component, /Self-hosted relay/);
  assert.match(component, /Test and use/);
  assert.doesNotMatch(component, /XMLHttpRequest|FormData|FileReader/);
  assert.match(page, /alternates: \{ canonical: "\/send" \}/);
  assert.match(navigation, /href: "\/send"/);
  assert.match(navigation, /LibreSend/);
});

test("same-Wi-Fi bridge serves one bounded book without a cloud upload", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "libresend-wifi-"));
  const filePath = join(directory, "A Reader's Book.epub");
  const bytes = Buffer.from("0123456789abcdef", "utf8");
  await writeFile(filePath, bytes);
  const bridge = await createLibreSendWifiBridge({
    filePath,
    host: "127.0.0.1",
    port: 0,
    token: "TESTCDE2",
    ttlMs: 60_000,
  });
  context.after(async () => {
    await bridge.close();
    await rm(directory, { recursive: true, force: true });
  });

  const address = bridge.addresses[0];
  const page = await fetch(address);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-security-policy") ?? "", /default-src 'none'/);
  const pageBody = await page.text();
  assert.match(pageBody, /A Reader&#39;s Book\.epub/);
  assert.doesNotMatch(pageBody, /<script/i);
  assert.match(pageBody, new RegExp(`href="/${bridge.token}/book"`));

  const koboPage = await fetch(address, { headers: { "user-agent": "Mozilla/5.0 (Linux; U; en-US) Kobo Touch" } });
  assert.equal(koboPage.status, 200);
  assert.match(await koboPage.text(), /Download this book/);

  const download = await fetch(`${address}/book`);
  assert.equal(download.status, 200);
  assert.equal(download.headers.get("content-type"), "application/epub+zip");
  assert.match(download.headers.get("content-disposition") ?? "", /filename\*=UTF-8''A%20Reader's%20Book\.epub/);
  assert.equal(download.headers.get("access-control-allow-origin"), null);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);

  const range = await fetch(`${address}/book`, { headers: { Range: "bytes=2-5" } });
  assert.equal(range.status, 206);
  assert.equal(range.headers.get("content-range"), "bytes 2-5/16");
  assert.equal(await range.text(), "2345");

  const head = await fetch(`${address}/book`, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("accept-ranges"), "bytes");
  assert.equal(await head.text(), "");

  const opds = await fetch(`${address}/opds`);
  assert.match(opds.headers.get("content-type") ?? "", /application\/atom\+xml/);
  assert.match(await opds.text(), /opds-spec\.org\/acquisition\/open-access/);

  assert.equal((await fetch(address.replace("TESTCDE2", "WRNGCDE2"))).status, 404);
});

test("LibreSend Local provides a loopback web interface and exposes only the selected book", async (context) => {
  const app = await createLibreSendLocalApp({
    controlHost: "127.0.0.1",
    controlPort: 0,
    receiveHost: "127.0.0.1",
    receivePort: 0,
    controlToken: "TESTCONTROLTOKEN123456",
    openBrowser: false,
    ttlMs: 60_000,
  });
  context.after(() => app.close());

  const controlPage = await fetch(app.url);
  assert.equal(controlPage.status, 200);
  assert.match(controlPage.headers.get("content-security-policy") ?? "", /connect-src 'self'/);
  assert.match(await controlPage.text(), /LibreSend Local/);
  assert.match(await (await fetch(app.url)).text(), /amazon\.co\.uk\/sendtokindle/);
  assert.equal((await fetch(new URL("/", app.url))).status, 404);

  const bytes = Buffer.from("first-party-local-app", "utf8");
  const upload = await fetch(new URL("api/file", app.url), {
    method: "PUT",
    headers: {
      "content-type": "application/epub+zip",
      "x-libresend-file-name": encodeURIComponent("Local Reader.epub"),
      "x-libresend-file-size": String(bytes.length),
    },
    body: bytes,
  });
  assert.equal(upload.status, 201);
  const payload = await upload.json() as { active: { fileName: string; addresses: string[]; opdsAddresses: string[] } };
  assert.equal(payload.active.fileName, "Local Reader.epub");
  assert.equal(payload.active.addresses.length, 1);

  const download = await fetch(`${payload.active.addresses[0]}/book`);
  assert.equal(download.headers.get("content-type"), "application/epub+zip");
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
  assert.match(await (await fetch(payload.active.opdsAddresses[0])).text(), /Local Reader\.epub/);

  const removed = await fetch(new URL("api/file", app.url), { method: "DELETE" });
  assert.deepEqual(await removed.json(), { active: null });
});
