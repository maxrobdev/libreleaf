# LibreSend

LibreSend is LibreLeaf's local-first handoff framework for EPUB, PDF and MOBI files and lawful access links. The `/send` route is the reference client. Local sharing and saving need no server.

## Transports

LibreSend separates the file from the way it moves:

1. **System share** passes the selected `File` to the browser's Web Share implementation. The operating system decides which installed apps and nearby-device routes are available.
2. **Local save** uses a short-lived object URL. Closing the page or selecting another file revokes it.
3. **Link handoff** shares a lawful source URL or copies it to the clipboard. Book results and Briefleaf use this without proxying content.
4. **Encrypted relay** is optional. The client encrypts the complete file with AES-256-GCM, uploads only the opaque envelope and puts the key in the receive-link fragment.

The public LibreLeaf deployment leaves the relay disabled. The reference client can test and use a self-hosted HTTPS relay for the current page session; it never turns LibreLeaf into a file proxy.

## Run the relay

The reference server requires Node 22 or newer and listens on loopback by default. With no storage directory it holds ciphertext in process memory.

```sh
npm run libresend:relay
```

For a persistent single-node relay, use the hardened Compose definition. Set an exact browser origin before exposing it:

```sh
LIBRESEND_ALLOWED_ORIGINS=https://books.example.org \
  docker compose -f compose.libresend.yaml up -d --build
```

Compose binds the relay to `127.0.0.1:8788`; put an HTTPS reverse proxy in front. The container drops Linux capabilities, uses a read-only root filesystem, includes a health check and writes only encrypted envelopes to its named volume.

The smaller in-memory container is useful for local or disposable deployments:

```sh
docker build -f Dockerfile.libresend-relay -t libresend-relay .
docker run --read-only --tmpfs /tmp -p 127.0.0.1:8788:8788 \
  -e LIBRESEND_ALLOWED_ORIGINS=https://books.example.org \
  libresend-relay
```

Configuration:

| Variable | Default | Boundary |
| --- | --- | --- |
| `LIBRESEND_HOST` | `127.0.0.1` | Set `0.0.0.0` only behind a configured reverse proxy. |
| `LIBRESEND_PORT` | `8788` | TCP port. |
| `LIBRESEND_ALLOWED_ORIGINS` | `http://localhost:3000` | Comma-separated exact browser origins; no wildcard. |
| `LIBRESEND_MAX_BYTES` | `26214400` | Encrypted-envelope cap; hard maximum 200 MiB. |
| `LIBRESEND_TTL_SECONDS` | `900` | 60 seconds to 24 hours. |
| `LIBRESEND_STORAGE_DIR` | empty | Empty uses memory; a path enables atomic persistent storage. |
| `LIBRESEND_STORAGE_MAX_BYTES` | `2147483648` | Total encrypted storage budget. |
| `LIBRESEND_STORAGE_MAX_OBJECTS` | `10000` | Pending-transfer count budget. |

The server applies a per-address request bucket, exact CORS origins, content-type and protocol checks, byte caps, expiry, no-store headers and destructive one-use reads. Memory storage is intentionally single-process. The filesystem store writes mode-0600 versioned objects, publishes them atomically and renames a file to a unique claim before reading it; competing recipients cannot both receive it. It is for one host with a shared local volume, not multiple replicas on network storage.

## Connect a client

For the Next/Vinext build, set `NEXT_PUBLIC_LIBRESEND_RELAY_URL` to the HTTPS relay origin. For the static client, set the fixed build-time tag in `netlify/send/index.html`:

```html
<meta name="libresend-relay-url" content="https://send.example.org" />
```

The `/send` page also accepts a self-hosted relay in its advanced section. It validates the capability endpoint and keeps the address only in the current page session. Plain HTTP is allowed only on loopback.

Generated receive links keep both the key and selected relay origin after `#`, so neither is sent to the LibreLeaf web server. The recipient still connects to that relay and therefore exposes ordinary network metadata to its operator.

## SDK surface

`lib/libresend/index.ts` is the source entry point. It exports file validation, local share/link handoff, encryption, the relay client, the portable Fetch handler, storage interfaces and transport registry. It has no dependency on React or the LibreLeaf UI.

```ts
import {
  createEncryptedRelayTransfer,
  createBrowserTransportRegistry,
  handleLibreSendRelayRequest,
} from "./lib/libresend/index.ts";
```

The framework stays as ordinary TypeScript in the open repository rather than hiding core behaviour behind a hosted SDK. A downstream project can vendor it or expose this entry point in its own package manifest.

## Custom storage

`lib/libresend/relay.ts` exports the portable Fetch API handler and storage contract:

```ts
interface LibreSendRelayStore {
  put(value: LibreSendRelayObject): Promise<void>;
  take(id: string, now: number): Promise<LibreSendRelayObject | null>;
  prune(now: number): Promise<number>;
}
```

`take` must be atomic and destructive. A durable adapter should enforce expiry independently, avoid logging identifiers or request bodies, and delete failed writes. Object stores should use a transaction or conditional delete so two recipients cannot retrieve the same transfer.

```ts
return handleLibreSendRelayRequest(request, {
  store: yourAtomicStore,
  allowedOrigins: ["https://books.example.org"],
  maxBytes: 10 * 1024 * 1024,
  ttlSeconds: 600,
  allowRequest: requestBudget,
  storageName: "postgres",
});
```

## Relay modules

Modules are a deliberately small server extension boundary. `authorize` receives method, path and origin only. `onEvent` receives transfer ID, byte count and timestamps, never the encrypted body, file metadata, key or request object. Observer failures do not break a completed transfer.

```ts
const aggregateMetrics = {
  id: "aggregate-metrics",
  authorize: ({ origin }) => origin === "https://books.example.org",
  onEvent(event) {
    counters.increment(event.type, "bytes" in event ? event.bytes : 0);
  },
};

return handleLibreSendRelayRequest(request, {
  store: yourAtomicStore,
  allowedOrigins: ["https://books.example.org"],
  modules: [aggregateMetrics],
});
```

Module IDs are unique and listed by the capability endpoint. Modules cannot see plaintext because encryption has already happened in the sender's browser. Do not use event hooks to build per-reader activity logs.

## Custom browser transports

`LibreSendTransportRegistry` ships with system-file share and share-or-copy-link adapters. A custom transport supplies a stable ID plus `available` and `send` methods. It receives the payload and browser context explicitly instead of reading global state. Duplicate IDs are rejected.

```ts
registry.register({
  id: "reading-room",
  label: "Reading-room inbox",
  available: (payload) => payload.kind === "link",
  async send(payload) {
    if (payload.kind !== "link") throw new Error("Links only");
    await yourInbox.add(payload.url);
    return { transport: "reading-room", status: "sent" };
  },
});
```

## Wire format

Protocol version 1 is an opaque binary envelope:

```text
4 bytes  "LSE1"
12 bytes AES-GCM IV
N bytes  AES-GCM ciphertext and authentication tag
```

The encrypted plaintext begins with a bounded JSON metadata block followed by the exact file bytes. The 256-bit key and relay origin are URL-encoded only after `#`. Browsers do not send URL fragments in HTTP requests. The app reads the fragment locally to locate the relay and decrypt the one-use envelope.

## Operational limits

Encryption protects content confidentiality but does not remove operator responsibility. A relay can still be abused as an opaque file drop and still observes IP addresses, timing, envelope size and transfer identifiers. A public operator needs logging minimisation, aggregate rate limits, takedown handling, lifecycle controls, capacity protection and legal review. LibreLeaf ships the protocol and self-hostable code without silently enabling a public relay.
