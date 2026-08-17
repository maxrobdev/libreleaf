export const LIBRESEND_MAX_FILE_BYTES = 200 * 1024 * 1024;
export const LIBRESEND_RELAY_DEFAULT_MAX_FILE_BYTES = 25 * 1024 * 1024;
export const LIBRESEND_ACCEPT = ".epub,.pdf,.mobi,application/epub+zip,application/pdf,application/x-mobipocket-ebook";

export type ReaderFileFormat = "EPUB" | "PDF" | "MOBI";

export type ReaderFileCandidate = {
  name: string;
  size: number;
  type: string;
};

export type ReaderFileCheck =
  | { ok: true; format: ReaderFileFormat }
  | { ok: false; reason: string };

export type LinkHandoffResult = "shared" | "copied" | "cancelled" | "unavailable";

type FileShareNavigator = {
  share?: (data: ShareData) => Promise<void>;
  canShare?: (data: ShareData) => boolean;
};

type LinkShareNavigator = {
  share?: (data: ShareData) => Promise<void>;
  clipboard?: { writeText?: (value: string) => Promise<void> };
};

const formats: Record<string, { format: ReaderFileFormat; mimeTypes: string[] }> = {
  epub: {
    format: "EPUB",
    mimeTypes: ["application/epub+zip", "application/zip"],
  },
  pdf: {
    format: "PDF",
    mimeTypes: ["application/pdf"],
  },
  mobi: {
    format: "MOBI",
    mimeTypes: ["application/x-mobipocket-ebook", "application/vnd.amazon.ebook", "application/mobi"],
  },
};

const genericMimeTypes = new Set(["", "application/octet-stream"]);

export function checkReaderFile(file: ReaderFileCandidate): ReaderFileCheck {
  const extension = file.name.trim().toLocaleLowerCase("en-GB").split(".").pop() ?? "";
  const config = formats[extension];
  if (!config) return { ok: false, reason: "Choose an EPUB, PDF or MOBI file." };
  if (!Number.isFinite(file.size) || file.size <= 0) return { ok: false, reason: "This file is empty." };
  if (file.size > LIBRESEND_MAX_FILE_BYTES) return { ok: false, reason: "Choose a file no larger than 200 MB." };

  const mimeType = file.type.trim().toLocaleLowerCase("en-GB");
  if (!genericMimeTypes.has(mimeType) && !config.mimeTypes.includes(mimeType)) {
    return { ok: false, reason: `The filename says ${config.format}, but the browser reports a different file type.` };
  }
  return { ok: true, format: config.format };
}

export function formatReaderFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

export function canShareReaderFile(navigatorLike: FileShareNavigator, file: File) {
  if (typeof navigatorLike.share !== "function" || typeof navigatorLike.canShare !== "function") return false;
  try {
    return navigatorLike.canShare({ files: [file] });
  } catch {
    return false;
  }
}

function safePublicUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export async function handoffLink(
  navigatorLike: LinkShareNavigator,
  input: { title: string; url: string },
): Promise<LinkHandoffResult> {
  if (!safePublicUrl(input.url)) return "unavailable";

  if (typeof navigatorLike.share === "function") {
    try {
      await navigatorLike.share({ title: input.title, url: input.url });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    }
  }

  if (typeof navigatorLike.clipboard?.writeText === "function") {
    try {
      await navigatorLike.clipboard.writeText(input.url);
      return "copied";
    } catch {
      return "unavailable";
    }
  }

  return "unavailable";
}
