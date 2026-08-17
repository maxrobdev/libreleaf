"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BRIEF_COUNTRIES,
  BRIEF_COUNTRY_LABELS,
  BRIEF_FEEDS,
  BRIEF_MAX_SELECTED_FEEDS,
  BRIEF_TOPICS,
  BRIEF_TOPIC_LABELS,
  feedsFor,
  topicsForCountry,
  type BriefCountry,
  type BriefFeed,
  type BriefTopic,
} from "../lib/brief/registry";
import { canShareReaderFile } from "../lib/libresend/core";
import type { BriefItem, BriefPayload, BriefSource } from "../lib/brief/service";
import { LibreSendLink } from "./LibreSendLink";
import styles from "./Briefleaf.module.css";

type DirectoryCountry = "ALL" | BriefCountry;
type DirectoryTopic = "ALL" | BriefTopic;
type ReaderTheme = "warm" | "dark";
type ReaderFont = "serif" | "sans";
type ContentMode = "all" | "full";

const feedById = new Map(BRIEF_FEEDS.map((feed) => [feed.id, feed]));
const languages = [...new Set(BRIEF_FEEDS.map((feed) => feed.language))].sort();

function dateLabel(value: string | undefined) {
  if (!value) return "Date not supplied";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date not supplied";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function stateLabel(source: BriefSource) {
  if (source.state === "live") return "Live";
  if (source.state === "cached") return "Cached";
  if (source.state === "stale") return "Stale fallback";
  return "Unavailable";
}

function selectionQuery(country: BriefCountry, topic: BriefTopic, feedIds: string[]) {
  const params = new URLSearchParams({ country, topic });
  for (const feedId of feedIds) params.append("feed", feedId);
  return params.toString();
}

function countryNames(feed: BriefFeed) {
  return feed.countries.map((country) => BRIEF_COUNTRY_LABELS[country]).join(", ");
}

function responseFilename(response: Response) {
  const disposition = response.headers.get("content-disposition") ?? "";
  const supplied = disposition.match(/filename="?([^";]+)"?/i)?.[1];
  return supplied?.replace(/[^a-z0-9._-]+/gi, "-") ?? `briefleaf-${new Date().toISOString().slice(0, 10)}.epub`;
}

export function Briefleaf() {
  const [country, setCountry] = useState<BriefCountry>("GB");
  const [topic, setTopic] = useState<BriefTopic>("top");
  const [selectedFeedIds, setSelectedFeedIds] = useState(() => feedsFor("GB", "top").map((feed) => feed.id));
  const [directoryQuery, setDirectoryQuery] = useState("");
  const [directoryCountry, setDirectoryCountry] = useState<DirectoryCountry>("ALL");
  const [directoryTopic, setDirectoryTopic] = useState<DirectoryTopic>("ALL");
  const [directoryLanguage, setDirectoryLanguage] = useState("ALL");
  const [selectionError, setSelectionError] = useState("");
  const [data, setData] = useState<BriefPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [readerItem, setReaderItem] = useState<BriefItem | null>(null);
  const [readerTheme, setReaderTheme] = useState<ReaderTheme>("warm");
  const [readerFont, setReaderFont] = useState<ReaderFont>("serif");
  const [readerFullscreen, setReaderFullscreen] = useState(false);
  const [contentMode, setContentMode] = useState<ContentMode>("all");
  const [epubFile, setEpubFile] = useState<File | null>(null);
  const [epubUrl, setEpubUrl] = useState("");
  const [epubBusy, setEpubBusy] = useState(false);
  const [epubStatus, setEpubStatus] = useState("");
  const epubUrlRef = useRef("");
  const readerCloseRef = useRef<HTMLButtonElement>(null);
  const topics = useMemo(() => topicsForCountry(country), [country]);
  const query = useMemo(
    () => selectionQuery(country, topic, selectedFeedIds),
    [country, topic, selectedFeedIds],
  );
  const readingItems = useMemo(
    () => data?.items.filter((item) => contentMode === "all" || Boolean(item.content)) ?? [],
    [contentMode, data],
  );
  const readerIndex = readerItem ? readingItems.findIndex((item) => item.id === readerItem.id) : -1;
  const previousReaderItem = readerIndex > 0 ? readingItems[readerIndex - 1] : undefined;
  const nextReaderItem = readerIndex >= 0 && readerIndex < readingItems.length - 1 ? readingItems[readerIndex + 1] : undefined;

  const visibleFeeds = useMemo(() => {
    const wanted = directoryQuery.trim().toLocaleLowerCase();
    return BRIEF_FEEDS.filter((feed) => {
      if (directoryCountry !== "ALL" && !feed.countries.includes(directoryCountry)) return false;
      if (directoryTopic !== "ALL" && feed.topic !== directoryTopic) return false;
      if (directoryLanguage !== "ALL" && feed.language !== directoryLanguage) return false;
      if (!wanted) return true;
      return [feed.name, feed.language, BRIEF_TOPIC_LABELS[feed.topic], countryNames(feed)]
        .some((value) => value.toLocaleLowerCase().includes(wanted));
    });
  }, [directoryCountry, directoryLanguage, directoryQuery, directoryTopic]);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("briefleaf-reader-theme");
    const savedFont = window.localStorage.getItem("briefleaf-reader-font");
    if (savedTheme === "warm" || savedTheme === "dark") setReaderTheme(savedTheme);
    if (savedFont === "serif" || savedFont === "sans") setReaderFont(savedFont);
  }, []);

  useEffect(() => {
    if (!readerItem) return;
    readerCloseRef.current?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setReaderItem(null);
      if (event.key === "ArrowLeft" && previousReaderItem) setReaderItem(previousReaderItem);
      if (event.key === "ArrowRight" && nextReaderItem) setReaderItem(nextReaderItem);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [nextReaderItem, previousReaderItem, readerItem]);

  useEffect(() => {
    if (readerItem && !readingItems.some((item) => item.id === readerItem.id)) {
      setReaderItem(null);
      setReaderFullscreen(false);
    }
  }, [readerItem, readingItems]);

  useEffect(() => {
    if (epubUrlRef.current) URL.revokeObjectURL(epubUrlRef.current);
    epubUrlRef.current = "";
    setEpubUrl("");
    setEpubFile(null);
    setEpubStatus("");
  }, [query]);

  useEffect(() => () => {
    if (epubUrlRef.current) URL.revokeObjectURL(epubUrlRef.current);
  }, []);

  useEffect(() => {
    if (!selectedFeedIds.length) {
      setData(null);
      setLoading(false);
      setError("Choose at least one reviewed feed.");
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setData(null);
    setError("");
    void fetch(`/api/brief?${query}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    }).then(async (response) => {
      const contentType = response.headers.get("content-type")?.toLocaleLowerCase() ?? "";
      if (!contentType.includes("application/json")) {
        throw new Error("Briefleaf API routing is unavailable. The server returned a non-JSON page.");
      }
      const payload = await response.json() as BriefPayload & { error?: string };
      if (!response.ok) {
        if (Array.isArray(payload.sources)) setData(payload);
        setError(payload.error ?? "Could not load the selected feeds.");
        return;
      }
      setData(payload);
    }).catch((reason) => {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setData(null);
      setError(reason instanceof Error ? reason.message : "Could not load the selected feeds.");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [query, selectedFeedIds.length]);

  function applyPreset(nextCountry: BriefCountry, nextTopic: BriefTopic) {
    setCountry(nextCountry);
    setTopic(nextTopic);
    setSelectedFeedIds(feedsFor(nextCountry, nextTopic).map((feed) => feed.id));
    setSelectionError("");
  }

  function toggleFeed(feed: BriefFeed) {
    if (selectedFeedIds.includes(feed.id)) {
      setSelectedFeedIds(selectedFeedIds.filter((feedId) => feedId !== feed.id));
      setSelectionError("");
      return;
    }
    if (selectedFeedIds.length >= BRIEF_MAX_SELECTED_FEEDS) {
      setSelectionError(`Select no more than ${BRIEF_MAX_SELECTED_FEEDS} feeds.`);
      return;
    }
    const duplicateUrl = selectedFeedIds.some((feedId) => feedById.get(feedId)?.feedUrl === feed.feedUrl);
    if (duplicateUrl) {
      setSelectionError("That official feed is already selected under another preset.");
      return;
    }
    setSelectedFeedIds([...selectedFeedIds, feed.id]);
    setSelectionError("");
  }

  function chooseTheme(next: ReaderTheme) {
    setReaderTheme(next);
    window.localStorage.setItem("briefleaf-reader-theme", next);
  }

  function chooseFont(next: ReaderFont) {
    setReaderFont(next);
    window.localStorage.setItem("briefleaf-reader-font", next);
  }

  function openReader(item: BriefItem) {
    setReaderItem(item);
  }

  function closeReader() {
    setReaderItem(null);
    setReaderFullscreen(false);
  }

  async function makeEpub() {
    setEpubBusy(true);
    setEpubStatus("");
    try {
      const response = await fetch(`/api/brief/epub?${query}`, {
        headers: { Accept: "application/epub+zip" },
      });
      const contentType = response.headers.get("content-type")?.toLocaleLowerCase() ?? "";
      if (!response.ok || !contentType.includes("application/epub+zip")) {
        let message = "The EPUB could not be created.";
        if (contentType.includes("application/json")) {
          const payload = await response.json() as { error?: string };
          if (payload.error) message = payload.error;
        }
        throw new Error(message);
      }
      const blob = await response.blob();
      const file = new File([blob], responseFilename(response), { type: "application/epub+zip" });
      if (epubUrlRef.current) URL.revokeObjectURL(epubUrlRef.current);
      const objectUrl = URL.createObjectURL(file);
      epubUrlRef.current = objectUrl;
      setEpubFile(file);
      setEpubUrl(objectUrl);
      setEpubStatus("EPUB ready. Use LibreSend or save it here.");
    } catch (reason) {
      setEpubStatus(reason instanceof Error ? reason.message : "The EPUB could not be created.");
    } finally {
      setEpubBusy(false);
    }
  }

  async function sendEpub() {
    if (!epubFile) return;
    if (!canShareReaderFile(navigator, epubFile)) {
      setEpubStatus("Direct file sharing is unavailable in this browser. Use Save EPUB.");
      return;
    }
    try {
      await navigator.share({ files: [epubFile], title: data?.editionTitle ?? "Briefleaf EPUB" });
      setEpubStatus("EPUB handed to LibreSend through your device share menu.");
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setEpubStatus("The share menu could not send this EPUB. Use Save EPUB.");
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className="eyebrow">REVIEWED RSS + EPUB</p>
        <h1>Briefleaf</h1>
        <p>Find official news feeds, combine a few, then read or save the text supplied in those feeds.</p>
        <details className={styles.whatIsThis}>
          <summary>How it works</summary>
          <p>Only reviewed publisher feeds are fetched. If a publisher includes the full article in RSS, Briefleaf can show it. Summary-only feeds link to the original report.</p>
        </details>
      </header>

      <section className={styles.controls} aria-labelledby="brief-options">
        <h2 id="brief-options">Quick preset</h2>
        <div className={styles.fields}>
          <label>
            Country
            <select
              value={country}
              onChange={(event) => {
                const nextCountry = event.target.value as BriefCountry;
                const nextTopics = topicsForCountry(nextCountry);
                const nextTopic = nextTopics.includes(topic) ? topic : nextTopics[0];
                applyPreset(nextCountry, nextTopic);
              }}
            >
              {BRIEF_COUNTRIES.map((value) => <option value={value} key={value}>{BRIEF_COUNTRY_LABELS[value]}</option>)}
            </select>
          </label>
          <label>
            Topic
            <select value={topic} onChange={(event) => applyPreset(country, event.target.value as BriefTopic)}>
              {topics.map((value) => <option value={value} key={value}>{BRIEF_TOPIC_LABELS[value]}</option>)}
            </select>
          </label>
        </div>

        <div className={styles.actions}>
          <button className={styles.download} type="button" disabled={loading || !data?.items.length || epubBusy} onClick={() => void makeEpub()}>
            {epubBusy ? "Making EPUB…" : epubFile ? "Rebuild EPUB" : "Make EPUB"}
          </button>
          {epubFile ? <button className={styles.send} type="button" onClick={() => void sendEpub()}>LibreSend</button> : null}
          {epubFile && epubUrl ? <a className={styles.send} href={epubUrl} download={epubFile.name}>Save EPUB</a> : null}
        </div>
        <details className={styles.selectionSummary}>
          <summary>{selectedFeedIds.length} {selectedFeedIds.length === 1 ? "feed" : "feeds"} selected</summary>
          <div className={styles.selectedFeeds} aria-label="Feeds in this edition">
            {selectedFeedIds.map((feedId) => {
              const feed = feedById.get(feedId);
              return feed ? <span key={feed.id}>{feed.name} · {BRIEF_TOPIC_LABELS[feed.topic]}</span> : null;
            })}
          </div>
        </details>
        {epubStatus ? <p className={styles.epubStatus} aria-live="polite">{epubStatus}</p> : null}
        <p className={styles.limit}>Up to {BRIEF_MAX_SELECTED_FEEDS} feeds and 24 items. No article pages are scraped.</p>
      </section>

      <section className={styles.directory} aria-labelledby="brief-directory">
        <div className={styles.directoryHeading}>
          <div><p className="eyebrow">DIRECTORY</p><h2 id="brief-directory">Reviewed official RSS feeds</h2></div>
          <p>{selectedFeedIds.length}/{BRIEF_MAX_SELECTED_FEEDS} selected</p>
        </div>
        <div className={styles.directoryFilters}>
          <label>Find a feed<input type="search" value={directoryQuery} onChange={(event) => setDirectoryQuery(event.target.value)} placeholder="Publisher, country or topic" /></label>
          <label>Country<select value={directoryCountry} onChange={(event) => setDirectoryCountry(event.target.value as DirectoryCountry)}><option value="ALL">All countries</option>{BRIEF_COUNTRIES.map((value) => <option value={value} key={value}>{BRIEF_COUNTRY_LABELS[value]}</option>)}</select></label>
          <label>Topic<select value={directoryTopic} onChange={(event) => setDirectoryTopic(event.target.value as DirectoryTopic)}><option value="ALL">All topics</option>{BRIEF_TOPICS.map((value) => <option value={value} key={value}>{BRIEF_TOPIC_LABELS[value]}</option>)}</select></label>
          <label>Language<select value={directoryLanguage} onChange={(event) => setDirectoryLanguage(event.target.value)}><option value="ALL">All languages</option>{languages.map((value) => <option value={value} key={value}>{value}</option>)}</select></label>
        </div>
        {selectionError ? <p className={styles.selectionError} role="alert">{selectionError}</p> : null}
        <ul className={styles.feedDirectory}>
          {visibleFeeds.map((feed) => {
            const selected = selectedFeedIds.includes(feed.id);
            const duplicateUrl = !selected && selectedFeedIds.some((feedId) => feedById.get(feedId)?.feedUrl === feed.feedUrl);
            const disabled = !selected && (selectedFeedIds.length >= BRIEF_MAX_SELECTED_FEEDS || duplicateUrl);
            return (
              <li key={feed.id}>
                <div className={styles.feedChoice}>
                  <input aria-label={`Include ${feed.name} ${BRIEF_TOPIC_LABELS[feed.topic]}`} id={`brief-feed-${feed.id}`} type="checkbox" checked={selected} disabled={disabled} onChange={() => toggleFeed(feed)} />
                  <span><strong>{feed.name}</strong><small>{BRIEF_TOPIC_LABELS[feed.topic]} · {countryNames(feed)} · {feed.language}</small></span>
                </div>
                <div><a href={feed.feedUrl} target="_blank" rel="noreferrer">RSS ↗</a><a href={feed.homepage} target="_blank" rel="noreferrer">Publisher ↗</a></div>
              </li>
            );
          })}
        </ul>
        {!visibleFeeds.length ? <p className={styles.noFeeds}>No reviewed feeds match these filters.</p> : null}
      </section>

      <section className={styles.preview} aria-labelledby="brief-preview">
        <div className={styles.previewHeading}>
          <div>
            <p className="eyebrow">COMBINED PREVIEW</p>
            <h2 id="brief-preview">{data?.editionTitle ?? "Selected feeds"}</h2>
          </div>
          <p aria-live="polite">{loading ? "Checking feeds…" : data ? `${readingItems.length}${contentMode === "full" ? ` of ${data.items.length}` : ""} items · checked ${dateLabel(data.generatedAt)}` : "No preview"}</p>
        </div>

        {data?.items.length ? (
          <div className={styles.readingModes} aria-label="RSS text filter">
            <button type="button" aria-pressed={contentMode === "all"} onClick={() => setContentMode("all")}>All items</button>
            <button type="button" aria-pressed={contentMode === "full"} onClick={() => setContentMode("full")}>Full RSS text <span>{data.items.filter((item) => item.content).length}</span></button>
          </div>
        ) : null}

        {error ? <div className={styles.notice}><strong>Could not complete this preview.</strong><p>{error}</p></div> : null}
        {data?.partial && data.items.length ? <div className={styles.notice}><strong>Some feeds did not respond.</strong><p>The available items are ready; source status is below.</p></div> : null}
        {!loading && data && !data.items.length ? <div className={styles.notice}><strong>No current items.</strong><p>Check the source status below or select another reviewed feed.</p></div> : null}
        {!loading && data?.items.length && !readingItems.length ? <div className={styles.notice}><strong>No full-text RSS items in this edition.</strong><p>Show all items or select another publisher. Summary-only feeds still link to the original report.</p></div> : null}
        {loading && !data ? <div className={styles.notice}><strong>Loading reviewed feeds…</strong></div> : null}

        {readingItems.length ? (
          <ol className={styles.items}>
            {readingItems.map((item) => (
              <li key={item.id}>
                <p className={styles.source}>{item.source.name} · {dateLabel(item.publishedAt)}<span>{item.content ? "Full RSS text" : "Summary"}</span></p>
                <h3><button className={styles.storyButton} type="button" onClick={() => openReader(item)}>{item.title}</button></h3>
                {item.summary ? <p>{item.summary}</p> : null}
                <button className={styles.readerButton} type="button" onClick={() => openReader(item)}>Reader view</button>
              </li>
            ))}
          </ol>
        ) : null}
      </section>

      {data ? (
        <details className={styles.sources}>
          <summary id="brief-sources">Sources <span>{data.sources.length} selected</span></summary>
          <ul>
            {data.sources.map((source) => (
              <li key={source.id}>
                <div><strong>{source.name}</strong><span>{stateLabel(source)} · {source.itemCount} items</span></div>
                {source.error ? <p>{source.error}</p> : null}
                <div><a href={source.homepage} target="_blank" rel="noreferrer">Source ↗</a><a href={source.termsUrl} target="_blank" rel="noreferrer">Terms ↗</a></div>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <aside className={styles.policy}>
        <strong>Publisher RSS only.</strong>
        <p>Briefleaf displays text supplied by each feed. It does not scrape article pages, bypass paywalls, rank editorial viewpoints, or treat inclusion as endorsement.</p>
      </aside>

      {readerItem ? (
        <div className={`${styles.readerBackdrop} ${readerFullscreen ? styles.readerBackdropFull : ""}`} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeReader(); }}>
          <section className={`${styles.reader} ${styles[readerTheme]} ${styles[readerFont]} ${readerFullscreen ? styles.fullPage : ""}`} role="dialog" aria-modal="true" aria-labelledby="brief-reader-title">
            <div className={styles.readerToolbar}>
              <div aria-label="Reader colour theme"><button type="button" aria-pressed={readerTheme === "warm"} onClick={() => chooseTheme("warm")}>Warm</button><button type="button" aria-pressed={readerTheme === "dark"} onClick={() => chooseTheme("dark")}>Dark</button></div>
              <div aria-label="Reader typeface"><button type="button" aria-pressed={readerFont === "serif"} onClick={() => chooseFont("serif")}>Serif</button><button type="button" aria-pressed={readerFont === "sans"} onClick={() => chooseFont("sans")}>Sans</button></div>
              <div aria-label="Article navigation"><button type="button" disabled={!previousReaderItem} onClick={() => previousReaderItem && setReaderItem(previousReaderItem)}>Previous</button><button type="button" disabled={!nextReaderItem} onClick={() => nextReaderItem && setReaderItem(nextReaderItem)}>Next</button></div>
              <LibreSendLink className={styles.readerShare} title={readerItem.title} url={readerItem.url} label="Send link" />
              <button type="button" aria-pressed={readerFullscreen} onClick={() => setReaderFullscreen((current) => !current)}>{readerFullscreen ? "Window" : "Full page"}</button>
              <button ref={readerCloseRef} type="button" onClick={closeReader} aria-label="Close reader">Close</button>
            </div>
            <p className={styles.readerMeta}>{readerItem.source.name} · {dateLabel(readerItem.publishedAt)}{readerIndex >= 0 ? ` · ${readerIndex + 1} of ${readingItems.length}` : ""}</p>
            <h2 id="brief-reader-title">{readerItem.title}</h2>
            {readerItem.content
              ? <div className={styles.readerText}>{readerItem.content.split(/\n{2,}/).map((paragraph, index) => <p key={`${readerItem.id}-${index}`}>{paragraph}</p>)}</div>
              : readerItem.summary
                ? <div className={styles.readerText}><p>{readerItem.summary}</p></div>
                : <div className={styles.readerText}><p>No text was supplied by this feed.</p></div>}
            <p className={styles.readerBoundary}>{readerItem.content ? "Full text supplied in this RSS item." : "This feed supplies a summary."}</p>
            <a className={styles.readerOriginal} href={readerItem.url} target="_blank" rel="noreferrer">{readerItem.content ? "Open original" : "Open full article"} at {readerItem.source.name} ↗</a>
          </section>
        </div>
      ) : null}
    </main>
  );
}
