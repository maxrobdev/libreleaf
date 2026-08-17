import { randomUUID } from "node:crypto";
import {
  constants,
  link,
  mkdir,
  open,
  readdir,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  LibreSendRelayCapacityError,
  type LibreSendRelayObject,
  type LibreSendRelayStore,
} from "../../lib/libresend/relay.ts";

const FILE_MAGIC = new TextEncoder().encode("LSS1");
const HEADER_BYTES = 20;
const transferIdPattern = /^[A-Za-z0-9_-]{24}$/;

type StoredFile = {
  id: string;
  path: string;
  bytes: number;
  createdAt: number;
  expiresAt: number;
};

function encodeHeader(value: LibreSendRelayObject) {
  const header = new Uint8Array(HEADER_BYTES);
  header.set(FILE_MAGIC, 0);
  const view = new DataView(header.buffer);
  view.setBigUint64(4, BigInt(value.createdAt));
  view.setBigUint64(12, BigInt(value.expiresAt));
  return header;
}

function decodeHeader(header: Uint8Array) {
  if (header.byteLength !== HEADER_BYTES || !FILE_MAGIC.every((byte, index) => header[index] === byte)) {
    throw new Error("Invalid LibreSend storage object.");
  }
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  return {
    createdAt: Number(view.getBigUint64(4)),
    expiresAt: Number(view.getBigUint64(12)),
  };
}

async function readExactly(handle: Awaited<ReturnType<typeof open>>, length: number, position: number) {
  const output = new Uint8Array(length);
  let offset = 0;
  while (offset < length) {
    const result = await handle.read(output, offset, length - offset, position + offset);
    if (result.bytesRead === 0) throw new Error("Truncated LibreSend storage object.");
    offset += result.bytesRead;
  }
  return output;
}

async function writeAll(handle: Awaited<ReturnType<typeof open>>, value: Uint8Array, position: number) {
  let offset = 0;
  while (offset < value.byteLength) {
    const result = await handle.write(value, offset, value.byteLength - offset, position + offset);
    if (result.bytesWritten === 0) throw new Error("Could not write LibreSend storage object.");
    offset += result.bytesWritten;
  }
}

export class FilesystemLibreSendRelayStore implements LibreSendRelayStore {
  readonly directory: string;
  readonly #maxObjects: number;
  readonly #maxBytes: number;
  #serial: Promise<void> = Promise.resolve();

  constructor(options: { directory: string; maxObjects?: number; maxBytes?: number }) {
    if (!options.directory.trim()) throw new Error("A LibreSend storage directory is required.");
    this.directory = resolve(options.directory);
    this.#maxObjects = Math.min(Math.max(options.maxObjects ?? 10_000, 1), 100_000);
    this.#maxBytes = Math.min(Math.max(options.maxBytes ?? 2 * 1024 * 1024 * 1024, 1024), 1024 * 1024 * 1024 * 1024);
  }

  async #locked<T>(operation: () => Promise<T>) {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolveGate) => { release = resolveGate; });
    const previous = this.#serial;
    this.#serial = previous.then(() => gate);
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  #objectPath(id: string) {
    if (!transferIdPattern.test(id)) throw new Error("Invalid LibreSend transfer identifier.");
    return join(this.directory, `${id}.lse`);
  }

  async #readStoredFile(id: string, path: string): Promise<StoredFile> {
    const info = await stat(path);
    if (!info.isFile() || info.size < HEADER_BYTES) throw new Error("Invalid LibreSend storage object.");
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const metadata = decodeHeader(await readExactly(handle, HEADER_BYTES, 0));
      return { id, path, bytes: info.size - HEADER_BYTES, ...metadata };
    } finally {
      await handle.close();
    }
  }

  async #scan(now: number, removeExpired: boolean) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const entries = await readdir(this.directory, { withFileTypes: true });
    const stored: StoredFile[] = [];
    let removed = 0;
    for (const entry of entries) {
      const match = entry.isFile() && entry.name.match(/^([A-Za-z0-9_-]{24})\.lse$/);
      if (!match) continue;
      const path = join(this.directory, entry.name);
      try {
        const value = await this.#readStoredFile(match[1], path);
        if (value.expiresAt <= now && removeExpired) {
          await rm(path, { force: true });
          removed += 1;
        } else {
          stored.push(value);
        }
      } catch {
        if (removeExpired) await rm(path, { force: true });
      }
    }
    return { stored, removed };
  }

  async put(value: LibreSendRelayObject) {
    return this.#locked(async () => {
      const now = Date.now();
      const { stored } = await this.#scan(now, true);
      const storedBytes = stored.reduce((total, item) => total + item.bytes, 0);
      if (stored.length >= this.#maxObjects || storedBytes + value.body.byteLength > this.#maxBytes) {
        throw new LibreSendRelayCapacityError("Relay storage is at capacity.");
      }

      const destination = this.#objectPath(value.id);
      const temporary = join(this.directory, `.${value.id}.${randomUUID()}.tmp`);
      const handle = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
      try {
        await writeAll(handle, encodeHeader(value), 0);
        await writeAll(handle, value.body, HEADER_BYTES);
        await handle.sync();
      } finally {
        await handle.close();
      }
      try {
        await link(temporary, destination);
      } finally {
        await rm(temporary, { force: true });
      }
    });
  }

  async take(id: string, now: number) {
    return this.#locked(async () => {
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      const source = this.#objectPath(id);
      const claimed = join(this.directory, `.${id}.${randomUUID()}.claim`);
      try {
        await rename(source, claimed);
      } catch {
        await rm(claimed, { force: true });
        return null;
      }

      try {
        const stored = await this.#readStoredFile(id, claimed);
        if (stored.expiresAt <= now) return null;
        const handle = await open(claimed, constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
          const body = await readExactly(handle, stored.bytes, HEADER_BYTES);
          return { id, body, createdAt: stored.createdAt, expiresAt: stored.expiresAt };
        } finally {
          await handle.close();
        }
      } finally {
        await rm(claimed, { force: true });
      }
    });
  }

  async prune(now: number) {
    return this.#locked(async () => (await this.#scan(now, true)).removed);
  }
}
