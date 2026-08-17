import { canShareReaderFile, handoffLink } from "./core.ts";

export type LibreSendPayload =
  | { kind: "file"; file: File; title?: string }
  | { kind: "link"; url: string; title: string };

export type LibreSendTransportContext = {
  navigator: Navigator;
};

export type LibreSendTransportResult = {
  transport: string;
  status: "sent" | "copied" | "cancelled";
};

export interface LibreSendTransport {
  id: string;
  label: string;
  available(payload: LibreSendPayload, context: LibreSendTransportContext): boolean;
  send(payload: LibreSendPayload, context: LibreSendTransportContext): Promise<LibreSendTransportResult>;
}

export class LibreSendTransportRegistry {
  readonly #transports = new Map<string, LibreSendTransport>();

  constructor(transports: LibreSendTransport[] = []) {
    for (const transport of transports) this.register(transport);
  }

  register(transport: LibreSendTransport) {
    if (!/^[a-z][a-z0-9-]{1,40}$/.test(transport.id)) throw new Error("LibreSend transport IDs use lowercase letters, numbers and hyphens.");
    if (this.#transports.has(transport.id)) throw new Error(`LibreSend transport ${transport.id} is already registered.`);
    this.#transports.set(transport.id, transport);
    return this;
  }

  available(payload: LibreSendPayload, context: LibreSendTransportContext) {
    return [...this.#transports.values()].filter((transport) => transport.available(payload, context));
  }

  async send(id: string, payload: LibreSendPayload, context: LibreSendTransportContext) {
    const transport = this.#transports.get(id);
    if (!transport || !transport.available(payload, context)) throw new Error("That LibreSend transport is unavailable.");
    return transport.send(payload, context);
  }
}

export const systemFileTransport: LibreSendTransport = {
  id: "system-file",
  label: "System file share",
  available: (payload, context) => payload.kind === "file" && canShareReaderFile(context.navigator, payload.file),
  async send(payload, context) {
    if (payload.kind !== "file" || typeof context.navigator.share !== "function") throw new Error("System file sharing is unavailable.");
    try {
      await context.navigator.share({ files: [payload.file], title: payload.title ?? payload.file.name });
      return { transport: "system-file", status: "sent" };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return { transport: "system-file", status: "cancelled" };
      throw error;
    }
  },
};

export const linkHandoffTransport: LibreSendTransport = {
  id: "link-handoff",
  label: "Share or copy link",
  available: (payload) => payload.kind === "link",
  async send(payload, context) {
    if (payload.kind !== "link") throw new Error("This transport accepts links only.");
    const result = await handoffLink(context.navigator, payload);
    if (result === "unavailable") throw new Error("Link sharing and clipboard access are unavailable.");
    return {
      transport: "link-handoff",
      status: result === "shared" ? "sent" : result,
    };
  },
};

export function createBrowserTransportRegistry() {
  return new LibreSendTransportRegistry([systemFileTransport, linkHandoffTransport]);
}
