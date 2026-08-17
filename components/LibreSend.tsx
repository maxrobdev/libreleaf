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
import styles from "./LibreSend.module.css";

const SEND_TO_KINDLE_URL = "https://www.amazon.co.uk/sendtokindle";
const SEND_TO_KINDLE_HELP_URL = "https://digprjsurvey.amazon.co.uk/csad/help/node/G5WYD9SAF7PGXRNA";
const KOBO_IMPORT_HELP_URL = "https://help.kobo.com/hc/en-us/articles/360024775093-Add-non-protected-PDF-and-ePub-files-to-your-Kobo-eReader-using-your-computer";
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
          <p className={styles.eyebrow}>LOCAL-FIRST FILE HANDOFF</p>
          <h1>LibreSend</h1>
          <p>Move an EPUB, PDF or MOBI with the system share sheet, or through an optional self-hosted encrypted relay.</p>
        </div>
        <dl className={styles.privacyFacts} aria-label="LibreSend privacy properties">
          <div><dt>Default</dt><dd>Local only</dd></div>
          <div><dt>Account</dt><dd>None</dd></div>
          <div><dt>Relay</dt><dd>{relayEndpoint ? "Connected" : "Off"}</dd></div>
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

      <section className={styles.workspace} aria-labelledby="select-file-title">
        <div className={styles.toolHeader}>
          <div>
            <span>01</span>
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

            <div className={styles.actions}>
              {selected.canShare ? (
                <button type="button" className={styles.shareAction} onClick={shareFile} disabled={handoff.kind === "working"}>
                  {handoff.kind === "working" ? "Opening share sheet…" : "Share with an app"}
                  <span aria-hidden="true">↗</span>
                </button>
              ) : (
                <p className={styles.unsupported}>File sharing is not available in this browser. Use the save or official device route.</p>
              )}
              <a className={styles.saveAction} href={selected.localUrl} download={selected.file.name}>
                Save a local copy <span aria-hidden="true">↓</span>
              </a>
            </div>

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
                ? "The operating system controls available share targets. LibreSend cannot choose or verify the destination."
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

      <section className={styles.deviceSection} aria-labelledby="device-routes-title">
        <div className={styles.toolHeader}>
          <div>
            <span>02</span>
            <h2 id="device-routes-title">Device routes</h2>
          </div>
          <p>Official instructions. LibreSend does not connect to Kindle or Kobo accounts.</p>
        </div>

        <div className={styles.deviceGrid}>
          <article className={styles.deviceCard}>
            <div className={styles.deviceName}><span>AMZ</span><h3>Kindle</h3></div>
            <ol>
              <li>For EPUB or PDF, open Amazon&apos;s Send to Kindle page.</li>
              <li>Choose the same local file and add it to your library.</li>
              <li>Sync the Kindle app or device.</li>
            </ol>
            <p>MOBI is not in Amazon&apos;s current Send to Kindle format list.</p>
            <div className={styles.officialLinks}>
              <a href={SEND_TO_KINDLE_URL} target="_blank" rel="noreferrer">Open Send to Kindle <span aria-hidden="true">↗</span></a>
              <a href={SEND_TO_KINDLE_HELP_URL} target="_blank" rel="noreferrer">Amazon format help <span aria-hidden="true">↗</span></a>
            </div>
          </article>

          <article className={styles.deviceCard}>
            <div className={styles.deviceName}><span>KBO</span><h3>Kobo</h3></div>
            <ol>
              <li>Use a non-protected EPUB or PDF.</li>
              <li>Connect the eReader, tap Connect, then open the KOBOeReader drive.</li>
              <li>Copy the file, eject the drive and open My Books.</li>
            </ol>
            <p>Kobo&apos;s official USB guide does not list MOBI.</p>
            <div className={styles.officialLinks}>
              <a href={KOBO_IMPORT_HELP_URL} target="_blank" rel="noreferrer">Open Kobo import guide <span aria-hidden="true">↗</span></a>
            </div>
          </article>
        </div>
      </section>

      <aside className={styles.boundary} aria-label="Privacy boundary">
        <strong>Privacy boundary</strong>
        <p>Local mode creates only a temporary browser URL. Relay mode encrypts the complete file before upload; the key stays in the link fragment and is not sent to the relay. A share destination may apply its own rules.</p>
      </aside>

      <details className={styles.framework}>
        <summary>Self-host LibreSend</summary>
        <p>Run the relay in memory, with persistent storage, or mount trusted local code for custom stores, policy and modules. The public LibreLeaf site does not run a relay.</p>
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
