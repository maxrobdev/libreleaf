import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
import { handleLibreSendRelayRequest, LibreSendRelayCapacityError, MemoryLibreSendRelayStore } from "../lib/libresend/relay.ts";
import { LibreSendTransportRegistry } from "../lib/libresend/transports.ts";

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
  assert.match(component, /createEncryptedRelayTransfer/);
  assert.match(component, /receiveEncryptedRelayTransfer/);
  assert.match(component, /relayEndpoint \? "Encrypted" : "Off"/);
  assert.doesNotMatch(component, /XMLHttpRequest|FormData|FileReader/);
  assert.match(page, /alternates: \{ canonical: "\/send" \}/);
  assert.match(navigation, /href: "\/send"/);
  assert.match(navigation, /LibreSend/);
});
