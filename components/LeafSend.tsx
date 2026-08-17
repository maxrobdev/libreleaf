"use client";

import { useEffect, useId, useRef, useState } from "react";
import { SiteNav } from "../app/components/SiteNav";
import {
  canShareReaderFile,
  checkReaderFile,
  formatReaderFileSize,
  LEAFSEND_ACCEPT,
  type ReaderFileFormat,
} from "../lib/leaf-send";
import styles from "./LeafSend.module.css";

const SEND_TO_KINDLE_URL = "https://www.amazon.co.uk/sendtokindle";
const SEND_TO_KINDLE_HELP_URL = "https://digprjsurvey.amazon.co.uk/csad/help/node/G5WYD9SAF7PGXRNA";
const KOBO_IMPORT_HELP_URL = "https://help.kobo.com/hc/en-us/articles/360024775093-Add-non-protected-PDF-and-ePub-files-to-your-Kobo-eReader-using-your-computer";

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

export function LeafSend() {
  const [selected, setSelected] = useState<SelectedReaderFile | null>(null);
  const [fileError, setFileError] = useState("");
  const [handoff, setHandoff] = useState<HandoffState>({ kind: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);
  const localUrlRef = useRef("");
  const fileHintId = useId();
  const statusId = useId();

  useEffect(() => () => {
    if (localUrlRef.current) URL.revokeObjectURL(localUrlRef.current);
  }, []);

  function releaseLocalUrl() {
    if (!localUrlRef.current) return;
    URL.revokeObjectURL(localUrlRef.current);
    localUrlRef.current = "";
  }

  function selectFile(file: File | undefined) {
    setFileError("");
    setHandoff({ kind: "idle" });
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

  return (
    <main className={styles.page}>
      <SiteNav active="send" />

      <header className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>LOCAL FILE HANDOFF</p>
          <h1>LeafSend</h1>
          <p>Move an EPUB, PDF or MOBI through your device&apos;s share sheet. LibreLeaf does not receive the file.</p>
        </div>
        <dl className={styles.privacyFacts} aria-label="LeafSend privacy properties">
          <div><dt>Upload</dt><dd>None</dd></div>
          <div><dt>Account</dt><dd>None</dd></div>
          <div><dt>Processing</dt><dd>On device</dd></div>
        </dl>
      </header>

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
              accept={LEAFSEND_ACCEPT}
              aria-describedby={fileHintId}
              onChange={(event) => selectFile(event.currentTarget.files?.[0])}
            />
            <span className={styles.fileMark} aria-hidden="true">↥</span>
            <strong>Select from this device</strong>
            <span id={fileHintId}>The file is checked by name, type and size. Its contents are not read or uploaded.</span>
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

            <p
              className={`${styles.handoffStatus} ${handoff.kind === "error" ? styles.error : ""}`}
              id={statusId}
              role={handoff.kind === "error" ? "alert" : "status"}
              aria-live="polite"
            >
              {handoff.kind === "idle"
                ? "The operating system controls available share targets. LeafSend cannot choose or verify the destination."
                : handoff.message}
            </p>
          </div>
        )}
        {fileError ? <p className={styles.fileError} role="alert">{fileError}</p> : null}
      </section>

      <section className={styles.deviceSection} aria-labelledby="device-routes-title">
        <div className={styles.toolHeader}>
          <div>
            <span>02</span>
            <h2 id="device-routes-title">Device routes</h2>
          </div>
          <p>Official instructions. LeafSend does not connect to Kindle or Kobo accounts.</p>
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
        <p>LeafSend creates only a temporary local browser URL for the save action. Closing the page releases it. A share destination may apply its own upload, account and privacy rules.</p>
      </aside>

      <footer className={styles.footer}>
        <a href="/">LibreLeaf</a>
        <span>Local handoff only. No file server.</span>
        <a href="/resources">Other tools <span aria-hidden="true">→</span></a>
      </footer>
    </main>
  );
}
