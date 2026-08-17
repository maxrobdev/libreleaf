import { realpath, stat } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  normaliseLibreSendHostExtension,
  type LibreSendHostExtension,
  type LibreSendHostExtensionContext,
  type LibreSendHostExtensionFactory,
} from "../../lib/libresend/host.ts";

const supportedExtensions = new Set([".js", ".mjs", ".ts", ".mts"]);

export async function loadLocalLibreSendHostExtension(
  value: string,
  context: LibreSendHostExtensionContext,
): Promise<LibreSendHostExtension | null> {
  const input = value.trim();
  if (!input) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(input)) {
    throw new Error("LIBRESEND_EXTENSION must be a local file path, not a URL.");
  }

  const requestedPath = resolve(input);
  if (!supportedExtensions.has(extname(requestedPath))) {
    throw new Error("LIBRESEND_EXTENSION must be a .js, .mjs, .ts or .mts module.");
  }
  const modulePath = await realpath(requestedPath);
  if (!(await stat(modulePath)).isFile()) throw new Error("LIBRESEND_EXTENSION must point to a file.");

  const imported = await import(pathToFileURL(modulePath).href) as {
    default?: unknown;
    createLibreSendHostExtension?: unknown;
  };
  const exported = imported.default ?? imported.createLibreSendHostExtension;
  if (!exported) throw new Error("The LibreSend host extension needs a default export.");
  const created = typeof exported === "function"
    ? await (exported as LibreSendHostExtensionFactory)(context)
    : exported;
  return normaliseLibreSendHostExtension(created);
}
