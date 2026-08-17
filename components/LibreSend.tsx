"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { SiteNav } from "../app/components/SiteNav";
import {
  canShareReaderFile,
  checkReaderFile,
  formatReaderFileSize,
  handoffLink,
  LIBRESEND_ACCEPT,
  type ReaderFileFormat,
} from "../lib/libresend/core";
import {
  createEncryptedRelayTransfer,
  getRelayStatus,
  normaliseRelayUrl,
  receiveEncryptedRelayTransfer,
} from "../lib/libresend/client";
import { LIBRESEND_DESTINATIONS, LibreSendRoute, type LibreSendDestination } from "./LibreSendRoute";
import styles from "./LibreSend.module.css";

const LIBRESEND_DOCS_URL = "https://github.com/maxrobdev/libreleaf/blob/main/docs/LIBRESEND.md";

type SelectedReaderFile = {
  file: File;
  format: ReaderFileFormat;
  localUrl: string;
  canShare: boolean;
};

type HandoffState =
  | { kind: "idle" }
  | { kind: "working"; message: string }
  | { kind: "success" | "error" | "info"; message: string };

type RelayState =
  | { kind: "idle" }
  | { kind: "working"; message: string }
  | { kind: "ready"; url: string; expiresAt: string; message: string }
  | { kind: "error"; message: string };

type ReceiveRequest = { id: string; key: string };

function configuredRelay(explicit: string | undefined) {
  const value = explicit || document.querySelector<HTMLMetaElement>('meta[name="libresend-relay-url"]')?.content || "";
  if (!value) return "";
  try {
    return normaliseRelayUrl(value);
  } catch {
    return "";
  }
}

export function LibreSend({ relayUrl }: { relayUrl?: string }) {
  const [destination, setDestination] = useState<LibreSendDestination>("phone");
  const [selected, setSelected] = useState<SelectedReaderFile | null>(null);
  const [fileError, setFileError] = useState("");
  const [handoff, setHandoff] = useState<HandoffState>({ kind: "idle" });
  const [relayEndpoint, setRelayEndpoint] = useState("");
  const [relayInput, setRelayInput] = useState("");
  const [relayConnection, setRelayConnection] = useState<HandoffState>({ kind: "idle" });
  const [relay, setRelay] = useState<RelayState>({ kind: "idle" });
  const [receiveRequest, setReceiveRequest] = useState<ReceiveRequest | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const localUrlRef = useRef("");
  const fileHintId = useId();
  const statusId = useId();

  useEffect(() => () => {
    if (localUrlRef.current) URL.revokeObjectURL(localUrlRef.current);
  }, []);

  useEffect(() => {
    const configured = configuredRelay(relayUrl);
    const id = new URLSearchParams(window.location.search).get("receive") ?? "";
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const key = fragment.get("key") ?? "";
    const linkedRelay = fragment.get("relay") ?? "";
    let endpoint = configured;
    if (linkedRelay) {
      try {
        endpoint = normaliseRelayUrl(linkedRelay);
      } catch {
        setRelayConnection({ kind: "error", message: "The transfer link contains an invalid relay address." });
      }
    }
    setRelayEndpoint(endpoint);
    setRelayInput(endpoint);
    if (id && key) setReceiveRequest({ id, key });
  }, [relayUrl]);

  async function connectRelay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRelayConnection({ kind: "working", message: "Checking relay capabilities…" });
    try {
      const endpoint = normaliseRelayUrl(relayInput);
      const status = await getRelayStatus(endpoint);
      setRelayEndpoint(endpoint);
      setRelayInput(endpoint);
      setRelayConnection({
        kind: "success",
        message: `Connected · ${status.storage ?? "custom"} storage${status.hostExtension ? ` · ${status.hostExtension}` : ""} · ${formatReaderFileSize(status.maxBytes)} limit · ${Math.round(status.ttlSeconds / 60)} min expiry.`,
      });
    } catch (error) {
      setRelayConnection({ kind: "error", message: error instanceof Error ? error.message : "The relay could not be connected." });
    }
  }

  function disconnectRelay() {
    setRelayEndpoint("");
    setRelayInput("");
    setRelay({ kind: "idle" });
    setRelayConnection({ kind: "info", message: "Relay disconnected for this browser session." });
  }

  function releaseLocalUrl() {
    if (!localUrlRef.current) return;
    URL.revokeObjectURL(localUrlRef.current);
    localUrlRef.current = "";
  }

  function selectFile(file: File | undefined) {
    setFileError("");
    setHandoff({ kind: "idle" });
    setRelay({ kind: "idle" });
    if (!file) return;

    const checked = checkReaderFile(file);
    if (!checked.ok) {
      setFileError(checked.reason);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    releaseLocalUrl();
    const localUrl = URL.createObjectURL(file);
    localUrlRef.current = localUrl;
    setSelected({
      file,
      format: checked.format,
      localUrl,
      canShare: canShareReaderFile(navigator, file),
    });
  }

  function clearFile() {
    releaseLocalUrl();
    setSelected(null);
    setFileError("");
    setHandoff({ kind: "idle" });
    setRelay({ kind: "idle" });
    if (inputRef.current) inputRef.current.value = "";
  }

  async function shareFile() {
    if (!selected || !selected.canShare) return;
    setHandoff({ kind: "working", message: "Opening the system share sheet…" });
    try {
      await navigator.share({ files: [selected.file], title: selected.file.name });
      setHandoff({ kind: "success", message: "The file was handed to the system share sheet." });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setHandoff({ kind: "info", message: "Share cancelled. The file is still selected locally." });
        return;
      }
      setHandoff({ kind: "error", message: "This browser could not share the file. Save a copy or use an official route below." });
    }
  }

  async function createRelayLink() {
    if (!selected || !relayEndpoint) return;
    setRelay({ kind: "working", message: "Encrypting on this device…" });
    try {
      const result = await createEncryptedRelayTransfer({
        file: selected.file,
        relayUrl: relayEndpoint,
        appUrl: window.location.origin,
      });
      setRelay({
        kind: "ready",
        url: result.receiveUrl,
        expiresAt: result.expiresAt,
        message: "One-use encrypted link ready.",
      });
    } catch (error) {
      setRelay({ kind: "error", message: error instanceof Error ? error.message : "The encrypted transfer could not be created." });
    }
  }

  async function shareRelayLink() {
    if (relay.kind !== "ready") return;
    const result = await handoffLink(navigator, { title: `LibreSend · ${selected?.file.name ?? "encrypted file"}`, url: relay.url });
    setRelay({
      ...relay,
      message: result === "shared" ? "Link sent." : result === "copied" ? "Link copied." : result === "cancelled" ? "Share cancelled; the link remains ready." : "Copy the link manually.",
    });
  }

  async function receiveFile() {
    if (!receiveRequest || !relayEndpoint) return;
    setHandoff({ kind: "working", message: "Receiving and decrypting on this device…" });
    try {
      const decrypted = await receiveEncryptedRelayTransfer({ ...receiveRequest, relayUrl: relayEndpoint });
      const file = new File([decrypted.bytes.slice().buffer], decrypted.name, { type: decrypted.type });
      selectFile(file);
      setReceiveRequest(null);
      window.history.replaceState({}, "", "/send");
      setHandoff({ kind: "success", message: "Encrypted transfer received. The file now exists only in this browser session." });
    } catch (error) {
      setHandoff({ kind: "error", message: error instanceof Error ? error.message : "The encrypted transfer could not be received." });
    }
  }

  return (
    <main className={styles.page}>
      <SiteNav active="send" />

      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>EBOOK DELIVERY</p>
          <h1>LibreSend</h1>
          <p>Choose where the book needs to go. LibreSend shows the shortest route that device actually supports.</p>
        </div>
        <dl className={styles.privacyFacts} aria-label="LibreSend privacy properties">
          <div><dt>File</dt><dd>EPUB, PDF, MOBI</dd></div>
          <div><dt>Default</dt><dd>No upload</dd></div>
          <div><dt>Private relay</dt><dd>{relayEndpoint ? "Connected" : "Off"}</dd></div>
        </dl>
      </header>

      {receiveRequest ? (
        <section className={styles.receive} aria-labelledby="receive-title">
          <div><span>INCOMING</span><h2 id="receive-title">Encrypted transfer</h2></div>
          {relayEndpoint ? (
            <button type="button" onClick={() => void receiveFile()} disabled={handoff.kind === "working"}>
              {handoff.kind === "working" ? "Receiving…" : "Receive once"}
            </button>
          ) : <p>This transfer needs its self-hosted relay address.</p>}
          {relayEndpoint ? <p>Relay: {new URL(relayEndpoint).host}</p> : null}
          {handoff.kind !== "idle" ? <p role={handoff.kind === "error" ? "alert" : "status"}>{handoff.message}</p> : null}
        </section>
      ) : null}

      <section className={styles.destinationSection} aria-labelledby="destination-title">
        <div className={styles.toolHeader}>
          <div><span>01</span><h2 id="destination-title">Where is it going?</h2></div>
          <p>Pick a destination. You can change it without choosing the file again.</p>
        </div>
        <div className={styles.destinationGrid}>
          {LIBRESEND_DESTINATIONS.map((item) => (
            <button
              className={destination === item.id ? styles.destinationSelected : undefined}
              type="button"
              aria-pressed={destination === item.id}
              onClick={() => {
                setDestination(item.id);
                setHandoff({ kind: "idle" });
              }}
              key={item.id}
            >
              <span>{item.mark}</span><strong>{item.label}</strong><small>{item.detail}</small><b aria-hidden="true">→</b>
            </button>
          ))}
        </div>
        <aside className={styles.localAppPromo} aria-labelledby="local-app-title">
          <div>
            <p>FIRST-PARTY LOCAL APP</p>
            <h3 id="local-app-title">Send from a computer without a cloud service</h3>
            <span>One command opens LibreSend on localhost. Choose a book in its web interface, then open the private 15-minute address on the receiving device.</span>
          </div>
          <code>npx --yes github:maxrobdev/libreleaf</code>
          <nav aria-label="LibreSend Local help"><a href="/guides/send-books-over-wifi-libresend">User instructions</a><a href="/docs/libresend">Technical reference</a></nav>
        </aside>
      </section>

      <section className={styles.workspace} aria-labelledby="select-file-title">
        <div className={styles.toolHeader}>
          <div>
            <span>02</span>
            <h2 id="select-file-title">Choose a file</h2>
          </div>
          <p>One file · EPUB, PDF or MOBI · 200 MB maximum</p>
        </div>

        {!selected ? (
          <label className={styles.picker}>
            <input
              ref={inputRef}
              type="file"
              accept={LIBRESEND_ACCEPT}
              aria-describedby={fileHintId}
              onChange={(event) => selectFile(event.currentTarget.files?.[0])}
            />
            <span className={styles.fileMark} aria-hidden="true">↥</span>
            <strong>Select from this device</strong>
            <span id={fileHintId}>Local share and save do not upload the file. Encrypted relay mode is separate and opt-in.</span>
          </label>
        ) : (
          <div className={styles.selectedFile}>
            <div className={styles.fileIdentity}>
              <span>{selected.format}</span>
              <div>
                <strong>{selected.file.name}</strong>
                <small>{formatReaderFileSize(selected.file.size)} · local file</small>
              </div>
              <button type="button" onClick={clearFile}>Remove</button>
            </div>

            <LibreSendRoute
              destination={destination}
              fileName={selected.file.name}
              format={selected.format}
              localUrl={selected.localUrl}
              canShare={selected.canShare}
              busy={handoff.kind === "working"}
              onShare={() => void shareFile()}
            />

            {relayEndpoint ? (
              <div className={styles.relayActions}>
                <button type="button" onClick={() => void createRelayLink()} disabled={relay.kind === "working"}>
                  {relay.kind === "working" ? relay.message : "Create encrypted link"}
                </button>
                {relay.kind === "ready" ? <button type="button" onClick={() => void shareRelayLink()}>Send link</button> : null}
                {relay.kind === "ready" ? <input aria-label="Encrypted LibreSend link" readOnly value={relay.url} onFocus={(event) => event.currentTarget.select()} /> : null}
                {relay.kind !== "idle" ? <p className={relay.kind === "error" ? styles.error : ""} role={relay.kind === "error" ? "alert" : "status"}>{relay.message}{relay.kind === "ready" && relay.expiresAt ? ` Expires ${new Date(relay.expiresAt).toLocaleString("en-GB")}.` : ""}</p> : null}
              </div>
            ) : null}

            <p
              className={`${styles.handoffStatus} ${handoff.kind === "error" ? styles.error : ""}`}
              id={statusId}
              role={handoff.kind === "error" ? "alert" : "status"}
              aria-live="polite"
            >
              {handoff.kind === "idle"
                ? "LibreSend keeps the file in this browser unless you choose a share, save, official service or self-hosted route."
                : handoff.message}
            </p>
          </div>
        )}
        {fileError ? <p className={styles.fileError} role="alert">{fileError}</p> : null}
      </section>

      <details className={styles.relaySetup}>
        <summary>Self-hosted relay</summary>
        <div>
          <p>Connect directly to your own LibreSend relay. The address stays in this page session; files are encrypted before an explicit upload.</p>
          <form onSubmit={(event) => void connectRelay(event)}>
            <label htmlFor="libresend-relay">Relay URL</label>
            <input
              id="libresend-relay"
              type="url"
              inputMode="url"
              placeholder="https://send.example.org"
              value={relayInput}
              onChange={(event) => setRelayInput(event.currentTarget.value)}
              required
            />
            <button type="submit" disabled={relayConnection.kind === "working"}>
              {relayConnection.kind === "working" ? "Checking…" : "Test and use"}
            </button>
            {relayEndpoint ? <button type="button" onClick={disconnectRelay}>Disconnect</button> : null}
          </form>
          {relayConnection.kind !== "idle" ? (
            <p className={relayConnection.kind === "error" ? styles.error : ""} role={relayConnection.kind === "error" ? "alert" : "status"}>
              {relayConnection.message}
            </p>
          ) : null}
        </div>
      </details>

      <aside className={styles.boundary} aria-label="Privacy boundary">
        <strong>Privacy boundary</strong>
        <p>System share and local save stay on this device. Amazon, Google Drive and Dropbox receive a file only when you explicitly choose them. Same-Wi-Fi mode serves directly from your computer. Relay mode is separate, opt-in and client-encrypted.</p>
      </aside>

      <details className={styles.framework}>
        <summary>Self-host LibreSend</summary>
        <p>Run the short-lived Wi-Fi bridge for one local book, or operate the encrypted relay with memory, persistent storage and custom policy modules. The public LibreLeaf site does not store transfer files.</p>
        <a href={LIBRESEND_DOCS_URL} target="_blank" rel="noreferrer">Server, modules and custom code ↗</a>
      </details>

      <footer className={styles.footer}>
        <a href="/">LibreLeaf</a>
        <span>Local by default. Relay is opt-in.</span>
        <a href="/resources">Other tools <span aria-hidden="true">→</span></a>
      </footer>
    </main>
  );
}
