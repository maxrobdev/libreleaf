# LibreSend

LibreSend is LibreLeaf's local-first handoff framework for EPUB, PDF and MOBI files and lawful access links. The `/send` route is the reference client. Local sharing and saving need no server.

## Transports

LibreSend separates the file from the way it moves:

1. **System share** passes the selected `File` to the browser's Web Share implementation. The operating system decides which installed apps and nearby-device routes are available.
2. **Local save** uses a short-lived object URL. Closing the page or selecting another file revokes it.
3. **Link handoff** shares a lawful source URL or copies it to the clipboard. Book results and Briefleaf use this without proxying content.
4. **Encrypted relay** is optional. The client encrypts the complete file with AES-256-GCM, uploads only the opaque envelope and puts the key in the receive-link fragment.

## Device routes

The `/send` page asks for the destination before it asks for a file. It then shows one route and its fallback instead of presenting every transport at once.

### iPhone and iPad

1. Choose **Phone or tablet**, then choose the EPUB or PDF.
2. Use **Open share sheet** and select Books, Kindle or another installed reader.
3. If the reader is absent, use **Save file**, open the file in Files and share it from there.
4. For Apple Books cross-device sync, enable iCloud Drive and Books in iCloud settings.

Apple documents opening received PDFs through Share → Books and syncing Books through iCloud:

- https://support.apple.com/en-gb/guide/iphone/iphab2193d5/ios
- https://support.apple.com/en-gb/guide/icloud/mm3941ae3362/icloud

### Android

1. Choose **Phone or tablet**, then choose the EPUB or PDF.
2. Use **Open share sheet** and select Kindle, KOReader or the installed reading app.
3. If file sharing is unavailable, save the file, open Downloads and use **Open with**.

LibreSend cannot select an app on the user's behalf. The operating system owns the share sheet.

### Kindle

Amazon does not publish a general third-party upload API for Kindle personal documents. LibreSend therefore uses the supported user-controlled paths:

- On iOS or Android, open the system share sheet and choose the Kindle app.
- On desktop, open https://www.amazon.co.uk/sendtokindle and choose the same local file. Amazon's web route accepts EPUB and PDF files up to 200 MB.
- Email is a fallback for up to 25 attachments totalling 50 MB. The sender must be approved in Amazon's Personal Document settings.

Amazon's current Send to Kindle list includes EPUB and PDF but not MOBI. Official references:

- https://digprjsurvey.amazon.co.uk/csad/help/node/G5WYD9SAF7PGXRNA
- https://digprjsurvey.amazon.co.uk/csad/help/node/G7NECT4B4ZWHQ8WV

Web security prevents LibreLeaf from inserting a file selected on `/send` into Amazon's website. The web route must ask the user to select it again; LibreSend states this explicitly.

### Kobo

Kobo officially supports non-protected EPUB and PDF sideloading.

- Google Drive and Dropbox are available on Kobo Forma, Sage, Elipsa, Elipsa 2E and Libra Colour. Link the service under **More → Settings → Accounts**, put the file in the Kobo folder, then sync the eReader.
- USB works across Kobo models: connect the reader, tap **Connect**, copy the file to `KOBOeReader`, eject and open **My Books**.
- LibreSend Wi-Fi is an experimental local browser/OPDS route for compatible devices and apps. It does not replace the official USB fallback.

Official Kobo instructions:

- https://help.kobo.com/hc/en-us/articles/15335985512983-Add-books-to-your-eReader-using-Google-Drive
- https://help.kobo.com/hc/en-us/articles/360033830114-Add-books-to-your-eReader-using-Dropbox
- https://help.kobo.com/hc/en-us/articles/360024775093-Add-non-protected-PDF-and-ePub-files-to-your-Kobo-eReader-using-your-computer

## LibreSend Local

LibreSend Local is the first-party application for moving one EPUB, PDF or MOBI from a computer without a cloud account. It opens a private localhost web interface where the user can choose or drop a file. The program then creates a random receiving address on the local network, exposes no directory listing, serves a no-script e-ink page, supports HTTP range downloads and publishes a one-entry OPDS acquisition feed.

### Run the app

Node.js 22.13 or newer is required. Run the maintained package directly from the LibreLeaf GitHub repository:

```sh
npx --yes github:maxrobdev/libreleaf
```

LibreSend normally opens the localhost interface automatically. If it cannot open a browser, copy the private address printed in the terminal into a browser on that computer. Choose one book in the page; no terminal file path is needed.

For development from a checkout:


```sh
git clone https://github.com/maxrobdev/libreleaf.git
cd libreleaf
npm install
npm run libresend
```

After selection, the local page shows receiving addresses similar to:

```text
http://192.168.1.42:8789/7K3M9QW2BC
http://192.168.1.42:8789/7K3M9QW2BC/opds
```

Use it as follows:

1. Keep the computer and receiving device on the same trusted Wi-Fi.
2. Type the first address into the device browser, or add the second address to an OPDS-capable reader app.
3. Download the book.
4. Use **Remove book** or **Close LibreSend** when finished. `Ctrl+C` also stops the program. The receiving link closes after 15 minutes even if the control app remains open.

The random path reduces accidental discovery but local HTTP is not encrypted. Other people controlling the same network may observe traffic. Use the bridge only on a trusted network and do not treat it as an internet-facing server. For a permanent library, use calibre's authenticated Content server: https://manual.calibre-ebook.com/server.html

### E-ink browser fallback

LibreSend has two deliberately small fallback surfaces:

- The LAN receiving page is a no-script, no-web-font HTML document with one download link. The file response includes a source-specific MIME type, `Content-Disposition`, `Content-Length`, `Accept-Ranges` and partial-response support. This is the path intended for a Kobo browser or another limited local client.
- The public `/send` shell contains visible static Kindle, Kobo and LibreSend Local instructions. A browser that ignores JavaScript modules can still read the official routes and copy the local-app command.

These fallbacks do not create proprietary device integrations. Kindle delivery remains the Kindle app share target, Amazon's web uploader or an approved Send to Kindle email. Kobo browser downloading varies by device and firmware, so the official USB workflow remains the universal fallback for non-protected EPUB and PDF files.

Implementation boundaries:

- The control server binds to loopback only and uses a random control path; receiving devices cannot access its controls.
- One explicitly selected file; no folder browsing or directory traversal.
- EPUB, PDF or MOBI only; 200 MiB hard limit inherited from LibreSend validation.
- `GET` and `HEAD` only; no uploads, CORS or remote control.
- `Cache-Control: no-store`, strict no-script landing page and safe attachment filenames.
- Random 10-character unambiguous token and a 15-minute default lifetime.
- OPDS 1.x acquisition entry for reader apps that support custom catalogues.

### Direct command for scripts

Automation can bypass the local interface and provide the file path directly:

```sh
npm run libresend:wifi -- "/path/to/book.epub"
```

That lower-level command uses the same receiving server and limits. The interactive `libresend` application is the supported route for ordinary users.

The public LibreLeaf deployment leaves the relay disabled. The reference client can test and use a self-hosted HTTPS relay for the current page session; it never turns LibreLeaf into a file proxy.

Self-hosters can keep the stock memory/filesystem host or load one reviewed local [host extension](./LIBRESEND_EXTENSIONS.md) for custom storage, policy and modules. Extension loading is off by default.

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
| `LIBRESEND_EXTENSION` | empty | Trusted local `.js`, `.mjs`, `.ts` or `.mts` host extension; URLs are rejected. |

The server applies a per-address request bucket, exact CORS origins, content-type and protocol checks, byte caps, expiry, no-store headers and destructive one-use reads. Memory storage is intentionally single-process. The filesystem store writes mode-0600 versioned objects, publishes them atomically and renames a file to a unique claim before reading it; competing recipients cannot both receive it. It is for one host with a shared local volume, not multiple replicas on network storage.

To run the checked-in community extension through a read-only Compose mount:

```sh
docker compose \
  -f compose.libresend.yaml \
  -f compose.libresend.extension.yaml \
  up -d --build
```

The extension example emits aggregate counts only. It does not log transfer identifiers or bodies. See the [extension API and trust model](./LIBRESEND_EXTENSIONS.md) before installing custom code.

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

Modules may also declare a validated semantic version and bounded capability slugs. The original `modules: string[]` response remains for protocol-1 clients; `moduleDetails`, `hostExtension` and `capabilities` let custom clients discover optional behaviour without exposing configuration or secrets.

## Trusted host extensions

A relay module is intentionally privacy-bounded. Operators who need custom atomic storage, request policy, CORS headers or lifecycle wiring can load one local host extension at startup. Host extensions run with full process privileges, so LibreSend never downloads, scans for, hot reloads or auto-updates them. Use the [host extension contract](./LIBRESEND_EXTENSIONS.md), the runnable example and the read-only Compose overlay.

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
