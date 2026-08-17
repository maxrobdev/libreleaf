# LibreSend

LibreSend is LibreLeaf's local-first handoff framework for EPUB, PDF and MOBI files and lawful access links. The `/send` route is the reference client. Local sharing and local saving need no server.

## Transports

LibreSend separates the file from the way it moves:

1. **System share** passes the selected `File` to the browser's Web Share implementation. The operating system decides which installed apps and nearby-device routes are available.
2. **Local save** uses a short-lived object URL. Closing the page or selecting another file revokes it.
3. **Link handoff** shares a lawful source URL or copies it to the clipboard. Book result panels use this transport without proxying the book.
4. **Encrypted relay** is optional. The client encrypts the whole file with AES-256-GCM, uploads only the opaque envelope, and puts the key in the URL fragment. The relay never receives that fragment.

The public LibreLeaf deployment leaves the relay disabled. Self-hosters may enable it after choosing their storage, abuse, rate-limit, retention and jurisdiction policy.

## Run the reference relay

The reference server requires Node 22 or newer and stores ciphertext only in process memory. It listens on loopback by default. The container runs the same dependency-free TypeScript handler with Node's type stripping; it does not install the web application's dependency tree.

```sh
npm run libresend:relay
```

Or build the checked-in container. Set an exact browser origin before exposing it:

```sh
docker build -f Dockerfile.libresend-relay -t libresend-relay .
docker run --read-only --tmpfs /tmp -p 8788:8788 \
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

The reference process applies a small per-address request bucket, exact CORS origins, content-type and protocol checks, byte caps, expiry, no-store headers and destructive one-use reads. Memory storage is intentionally single-process: restarting the process loses pending transfers, and multiple replicas do not share state.

## Connect a self-hosted client

For the Next/Vinext build, set `NEXT_PUBLIC_LIBRESEND_RELAY_URL` to the HTTPS relay origin. For the static Netlify client, add a fixed build-time tag to `netlify/send/index.html`:

```html
<meta name="libresend-relay-url" content="https://send.example.org" />
```

The client accepts HTTPS relays, with plain HTTP allowed only for loopback development. Relay endpoints are configuration, not user input; arbitrary proxy targets are rejected.

## Custom storage adapter

`lib/libresend/relay.ts` exports the portable Fetch API handler and the storage interface:

```ts
interface LibreSendRelayStore {
  put(value: LibreSendRelayObject): Promise<void>;
  take(id: string, now: number): Promise<LibreSendRelayObject | null>;
  prune(now: number): Promise<number>;
}
```

`take` must be atomic and destructive. A durable adapter should encrypt its own storage, enforce the supplied expiry independently, avoid logging identifiers or request bodies, and delete failed/partial writes. Object stores should use a conditional delete or transaction so two recipients cannot retrieve the same transfer.

Use the framework without the reference server:

```ts
const response = await handleLibreSendRelayRequest(request, {
  store: yourStore,
  allowedOrigins: ["https://books.example.org"],
  maxBytes: 10 * 1024 * 1024,
  ttlSeconds: 600,
  allowRequest: requestBudget,
});
```

Browser transports are also replaceable. `LibreSendTransportRegistry` ships with system-file share and share-or-copy-link adapters. A custom transport supplies a stable ID plus `available` and `send` methods; it receives the payload and browser context explicitly rather than reading global state.

## Wire format

Protocol version 1 is an opaque binary envelope:

```text
4 bytes  "LSE1"
12 bytes AES-GCM IV
N bytes  AES-GCM ciphertext and authentication tag
```

The encrypted plaintext starts with a bounded JSON metadata length and metadata block, followed by the exact file bytes. The 256-bit key is base64url-encoded only in `#key=…`. Browsers do not send URL fragments in HTTP requests.

## Limits of encrypted relays

Encryption protects content confidentiality but does not remove operational responsibility. A relay can still be abused as an opaque file drop, and it still observes IP addresses, timing, envelope size and transfer identifiers. A public operator needs explicit logging minimisation, aggregate rate limits, takedown handling, storage lifecycle controls, capacity protection and legal review. LibreLeaf therefore ships the protocol and self-hostable code without silently enabling a public relay.
