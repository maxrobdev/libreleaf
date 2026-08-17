# LibreSend extensions

LibreSend has three explicit extension boundaries. They are not interchangeable.

| Boundary | Runs where | Can see | Use it for |
| --- | --- | --- | --- |
| Browser transport | Reader's browser | The file or lawful link the reader chose | A new explicit handoff target |
| Relay module | Self-hosted relay | Method, path, origin and bounded lifecycle metadata | Admission policy and aggregate events |
| Host extension | Self-hosted Node process | Full process privileges and any custom store it installs | Storage, request policy, headers and lifecycle wiring |

The default LibreLeaf site does not load a host extension or run a public relay.

## Load trusted operator code

The Node host accepts one local module through `LIBRESEND_EXTENSION`. It does not accept an HTTP URL, does not scan a directory and does not hot reload code. The module is resolved to a real local file and imported once at process startup. Restart the relay for changes.

```sh
LIBRESEND_EXTENSION=./examples/libresend/community-extension.mjs \
  npm run libresend:relay
```

Validate the public manifest before starting it:

```sh
npm run libresend:extension:check -- ./examples/libresend/community-extension.mjs
```

Validation executes the module. Use it only with code you trust. A host extension is not sandboxed: it has the same filesystem, environment and network permissions as the relay process.

For Docker Compose, mount the module read-only with the supplied overlay:

```sh
LIBRESEND_ALLOWED_ORIGINS=https://books.example.org \
  docker compose \
    -f compose.libresend.yaml \
    -f compose.libresend.extension.yaml \
    up -d --build
```

Set `LIBRESEND_EXTENSION_FILE` to use another local `.js`, `.mjs`, `.ts` or `.mts` file. The overlay mounts it at `/etc/libresend/extension.mjs` with `read_only: true`. Keep the container root filesystem read-only too.

## Host contract

A default export may be an extension object or a factory. The factory receives immutable public host configuration plus the already-created default memory/filesystem store.

```js
export default function createHost(context) {
  return {
    id: "reading-room",
    modules: [{
      id: "aggregate-events",
      version: "1.0.0",
      capabilities: ["aggregate-events"],
      onEvent(event) {
        counters.add(event.type, "bytes" in event ? event.bytes : 0);
      },
    }],
    publicCapabilities: { profile: "reading-room" },
    onReady({ storage }) {
      console.log(`Relay ready with ${storage}`);
    },
  };
}
```

The TypeScript identity helper is exported from `lib/libresend/index.ts`:

```ts
import { defineLibreSendHostExtension } from "./lib/libresend/index.ts";

export default defineLibreSendHostExtension((context) => ({
  id: "my-host",
  modules: [],
  publicCapabilities: { profile: context.defaultStorage.name },
}));
```

Supported host fields:

- `id`: stable lowercase extension ID.
- `modules`: privacy-bounded relay modules. IDs are unique; versions and capability slugs are validated.
- `store` and `storageName`: replace the default store. Both are required together.
- `allowRequest`: add operator policy after the built-in per-address bucket. It cannot weaken the core origin, size, expiry or protocol checks.
- `allowedHeaders`: add up to 16 lowercase CORS request headers for a custom client.
- `publicCapabilities`: bounded primitive values exposed by `/v1/status`; never put secrets here.
- `onReady` and `onClose`: process lifecycle hooks.

An extension cannot change the configured CORS origin list, byte cap or TTL. Operators change those boundaries with the existing explicit environment variables.

## Custom storage

Return a `store` implementing the atomic contract and a public `storageName`:

```ts
interface LibreSendRelayStore {
  put(value: LibreSendRelayObject): Promise<void>;
  take(id: string, now: number): Promise<LibreSendRelayObject | null>;
  prune(now: number): Promise<number>;
}
```

`take` must claim and delete in one atomic operation. A database adapter should use a transaction or conditional delete. An object-store adapter needs an equivalent compare-and-delete mechanism; an ordinary read followed by delete can deliver the same envelope twice. The store handles ciphertext, but it still observes transfer IDs, sizes and timestamps.

## Capability discovery

`GET /v1/status` remains backward compatible and now also reports the host extension plus versioned module details:

```json
{
  "protocol": "1",
  "storage": "filesystem",
  "modules": ["aggregate-events"],
  "moduleDetails": [{
    "id": "aggregate-events",
    "version": "1.0.0",
    "capabilities": ["aggregate-events"]
  }],
  "hostExtension": "community-host",
  "capabilities": {
    "profile": "community",
    "metrics": "aggregate-only"
  }
}
```

Clients must use the protocol field for wire compatibility. Module and capability fields describe optional behaviour; they must not silently change encryption or one-use retrieval.

## Security rules

- Load only reviewed local code and pin its source revision.
- Mount extension code read-only and run it without root, Linux capabilities or Docker socket access.
- Do not log transfer IDs, IP-to-transfer mappings, headers, envelope bodies or reader filenames.
- Keep secrets outside the public capability object and repository.
- Preserve exact origins, bounded bodies, one-use atomic retrieval and expiry in custom deployments.
- A browser transport handles plaintext by design. Register it only after an explicit reader action and name the destination clearly.

The extension API deliberately has no marketplace, remote installer or auto-update mechanism. Deployment remains an operator-owned code review and restart.
