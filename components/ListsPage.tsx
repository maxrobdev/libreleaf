"use client";

import { useCallback, useEffect, useState } from "react";
import styles from "./ListsPage.module.css";

type SourceState = "live" | "stale" | "unavailable";

type LiveListItem = {
  id: string;
  title: string;
  authors: string[];
  cover?: string;
  publishedAt?: string;
  sourceUrl: string;
  actionUrl: string;
  actionLabel: string;
  access: "download" | "borrow-preview";
  metric?: { label: string; value: number };
  rights: { jurisdiction: "US" | "varies"; note: string };
};

type LiveList = {
  id: string;
  title: string;
  description: string;
  source: { name: string; url: string; documentation: string };
  state: SourceState;
  updatedAt: string;
  items: LiveListItem[];
  error?: string;
};

type LiveListsPayload = {
  generatedAt: string;
  refreshAfterSeconds: number;
  partial: boolean;
  lists: LiveList[];
};

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown update time";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function resolverUrl(item: LiveListItem) {
  return `/search?q=${encodeURIComponent(item.title)}&by=title`;
}

function sourceStatus(state: SourceState) {
  if (state === "live") return "Live source";
  if (state === "stale") return "Cached source";
  return "Source unavailable";
}

function metric(item: LiveListItem) {
  if (item.metric) return `${new Intl.NumberFormat("en-GB").format(item.metric.value)} ${item.metric.label}`;
  if (item.publishedAt) {
    const year = Number(item.publishedAt);
    if (Number.isInteger(year) && String(year) === item.publishedAt) return `First published ${year}`;
    const date = new Date(item.publishedAt);
    if (!Number.isNaN(date.getTime())) return `Released ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(date)}`;
  }
  return item.access === "download" ? "Direct file" : "Availability varies";
}

function ListRow({ item, rank, source }: { item: LiveListItem; rank: number; source: string }) {
  return (
    <li className={styles.row}>
      <span className={styles.rank} aria-label={`Rank ${rank}`}>{String(rank).padStart(2, "0")}</span>
      <a className={styles.cover} href={item.sourceUrl} target="_blank" rel="noreferrer" aria-label={`Open ${item.title} at ${source}`}>
        {item.cover ? <img src={item.cover} alt="" loading="lazy" /> : <span aria-hidden="true">{item.title.slice(0, 1)}</span>}
      </a>
      <div className={styles.book}>
        <p className={styles.signal}>{metric(item)}</p>
        <h3><a href={resolverUrl(item)}>{item.title}</a></h3>
        <p className={styles.author}>{item.authors.length ? item.authors.join(", ") : "Author not listed"}</p>
        <div className={styles.actions}>
          <a className={styles.primary} href={item.actionUrl} target="_blank" rel="noreferrer">{item.actionLabel} <span aria-hidden="true">↗</span></a>
          <a href={resolverUrl(item)}>All lawful routes</a>
        </div>
        <details className={styles.rights}>
          <summary>Rights · {item.rights.jurisdiction === "US" ? "US assessment" : "varies"}</summary>
          <p>{item.rights.note}</p>
        </details>
      </div>
    </li>
  );
}

export default function ListsPage() {
  const [data, setData] = useState<LiveListsPayload | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const refreshAfterSeconds = data?.refreshAfterSeconds;

  const load = useCallback(async (manual = false, signal?: AbortSignal) => {
    if (manual) setRefreshing(true);
    try {
      const response = await fetch("/api/lists", { signal, cache: "no-store" });
      if (!response.ok) throw new Error("Live lists are temporarily unavailable.");
      const payload = await response.json() as LiveListsPayload;
      setData(payload);
      setError("");
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setError(reason instanceof Error ? reason.message : "Live lists are temporarily unavailable.");
    } finally {
      if (manual) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(false, controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    if (!refreshAfterSeconds) return;
    const interval = window.setInterval(() => void load(), Math.max(refreshAfterSeconds, 300) * 1_000);
    return () => window.clearInterval(interval);
  }, [refreshAfterSeconds, load]);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className="eyebrow">LIVE CATALOGUE SIGNALS</p>
          <h1>Live book lists</h1>
        </div>
        <p>Current data from public catalogue APIs and feeds. Every row names its source and access terms.</p>
      </header>

      <div className={styles.toolbar} aria-live="polite">
        <span>{data ? `Checked ${formatTimestamp(data.generatedAt)}` : "Checking sources…"}</span>
        <span>Refreshes every 15 minutes</span>
        <button type="button" onClick={() => void load(true)} disabled={refreshing}>{refreshing ? "Checking…" : "Check again"}</button>
      </div>

      {error && !data ? <div className="status-card"><strong>Could not load lists.</strong><p>{error}</p></div> : null}
      {!data && !error ? <div className="status-card"><strong>Loading live sources…</strong></div> : null}
      {error && data ? <p className={styles.inlineError}>{error} Showing the last successful response.</p> : null}

      {data ? (
        <div className={styles.lists}>
          {data.lists.map((list) => (
            <section className={styles.section} key={list.id}>
              <header className={styles.sectionHeader}>
                <div>
                  <div className={styles.sourceLine}>
                    <span className={`${styles.state} ${styles[list.state]}`}>{sourceStatus(list.state)}</span>
                    <a href={list.source.url} target="_blank" rel="noreferrer">{list.source.name} ↗</a>
                  </div>
                  <h2>{list.title}</h2>
                  <p>{list.description}</p>
                </div>
                <div className={styles.updated}>
                  <span>Source update</span>
                  <time dateTime={list.updatedAt}>{formatTimestamp(list.updatedAt)}</time>
                  <a href={list.source.documentation} target="_blank" rel="noreferrer">API / feed docs ↗</a>
                </div>
              </header>

              {list.items.length ? (
                <ol className={styles.grid}>
                  {list.items.map((item, index) => <ListRow key={item.id} item={item} rank={index + 1} source={list.source.name} />)}
                </ol>
              ) : (
                <div className={styles.sourceError}>
                  <strong>{sourceStatus(list.state)}</strong>
                  <p>{list.error ?? "No current records were returned."}</p>
                  <a href={list.source.url} target="_blank" rel="noreferrer">Open source directly ↗</a>
                </div>
              )}
              {list.error && list.items.length ? <p className={styles.staleNote}>{list.error} Showing the most recent cached list.</p> : null}
            </section>
          ))}
        </div>
      ) : null}

      <aside className={styles.policy}>
        <strong>“Free” is source- and country-specific.</strong>
        <p>Project Gutenberg and Standard Ebooks assess these editions under US law. Open Library entries are catalogue, lending, or preview routes. LibreLeaf does not turn availability into a copyright claim; check the rules where you are.</p>
      </aside>
    </main>
  );
}
