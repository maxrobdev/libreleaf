"use client";

import { useMemo, useState } from "react";
import styles from "./ResourcesDirectory.module.css";

type ResourceKind = "software" | "catalogues" | "uk";

type ResourceLink = {
  label: string;
  href: string;
};

type Resource = {
  name: string;
  kind: ResourceKind;
  label: string;
  description: string;
  bestFor: string;
  links: ResourceLink[];
};

const filters: { value: "all" | ResourceKind; label: string }[] = [
  { value: "all", label: "All" },
  { value: "software", label: "Reader tools" },
  { value: "catalogues", label: "Open catalogues" },
  { value: "uk", label: "UK libraries" },
];

const resources: Resource[] = [
  {
    name: "calibre",
    kind: "software",
    label: "Open-source library manager",
    description: "Organise, convert, edit and transfer ebooks on Windows, macOS and Linux.",
    bestFor: "Managing a local ebook collection",
    links: [
      { label: "Download calibre", href: "https://calibre-ebook.com/download" },
      { label: "User manual", href: "https://manual.calibre-ebook.com/" },
      { label: "Tutorials", href: "https://manual.calibre-ebook.com/#tutorials" },
    ],
  },
  {
    name: "KOReader",
    kind: "software",
    label: "Open-source document reader",
    description: "A configurable reader for dedicated e-ink devices and Android, with broad format support.",
    bestFor: "Reading on Kobo, Kindle and Android devices",
    links: [
      { label: "Download KOReader", href: "https://koreader.rocks/" },
      { label: "User guide", href: "https://koreader.rocks/user_guide/" },
    ],
  },
  {
    name: "Project Gutenberg",
    kind: "catalogues",
    label: "Public-domain ebook archive",
    description: "Volunteer-produced ebooks in EPUB, HTML, plain text and other open formats.",
    bestFor: "A large catalogue of older works",
    links: [
      { label: "Browse ebooks", href: "https://www.gutenberg.org/" },
      { label: "Reading guide", href: "https://www.gutenberg.org/help/reading_options.html" },
    ],
  },
  {
    name: "Standard Ebooks",
    kind: "catalogues",
    label: "Carefully produced public-domain editions",
    description: "Proofread, standards-based ebooks with consistent typography, metadata and covers.",
    bestFor: "Polished editions of classic works",
    links: [{ label: "Browse ebooks", href: "https://standardebooks.org/ebooks" }],
  },
  {
    name: "LibriVox",
    kind: "catalogues",
    label: "Public-domain audiobooks",
    description: "Free recordings of public-domain texts, read and reviewed by volunteers.",
    bestFor: "Downloading or streaming classic audiobooks",
    links: [
      { label: "Browse audiobooks", href: "https://librivox.org/search" },
      { label: "Listening guide", href: "https://librivox.org/pages/about-listening-to-librivox/" },
    ],
  },
  {
    name: "Open Library",
    kind: "catalogues",
    label: "Open catalogue and digital lending",
    description: "An Internet Archive project with book records, readable titles and time-limited loans.",
    bestFor: "Searching editions and borrowing available books",
    links: [{ label: "Open catalogue", href: "https://openlibrary.org/" }],
  },
  {
    name: "Local library services",
    kind: "uk",
    label: "Official GOV.UK postcode finder",
    description: "Find your council library service, then check its ebook, audiobook and membership options.",
    bestFor: "Lawful digital loans near you",
    links: [{ label: "Find a local library", href: "https://www.gov.uk/local-library-services" }],
  },
];

export function ResourcesDirectory() {
  const [activeFilter, setActiveFilter] = useState<"all" | ResourceKind>("all");
  const [query, setQuery] = useState("");

  const visibleResources = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("en-GB");

    return resources.filter((resource) => {
      const matchesKind = activeFilter === "all" || resource.kind === activeFilter;
      const searchable = `${resource.name} ${resource.label} ${resource.description} ${resource.bestFor}`.toLocaleLowerCase("en-GB");
      return matchesKind && (!needle || searchable.includes(needle));
    });
  }, [activeFilter, query]);

  return (
    <section className={styles.directory} aria-labelledby="directory-title">
      <div className={styles.heading}>
        <h2 id="directory-title">Resources</h2>
      </div>

      <div className={styles.controls}>
        <label className={styles.search}>
          <span className={styles.srOnly}>Filter resources by name or purpose</span>
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter tools and catalogues"
          />
        </label>
        <div className={styles.filters} aria-label="Resource categories">
          {filters.map((filter) => (
            <button
              key={filter.value}
              type="button"
              className={activeFilter === filter.value ? styles.active : undefined}
              aria-pressed={activeFilter === filter.value}
              onClick={() => setActiveFilter(filter.value)}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <p className={styles.count} aria-live="polite">
        {visibleResources.length} {visibleResources.length === 1 ? "resource" : "resources"}
      </p>

      {visibleResources.length ? (
        <div className={styles.grid}>
          {visibleResources.map((resource, index) => (
            <article className={styles.card} key={resource.name}>
              <div className={styles.cardTopline}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <span>{filters.find((filter) => filter.value === resource.kind)?.label}</span>
              </div>
              <h3>{resource.name}</h3>
              <p className={styles.label}>{resource.label}</p>
              <p className={styles.description}>{resource.description}</p>
              <div className={styles.links}>
                {resource.links.map((link, linkIndex) => (
                  <a
                    className={linkIndex === 0 ? styles.primaryLink : styles.secondaryLink}
                    href={link.href}
                    key={link.href}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {link.label}
                    <span aria-hidden="true">↗</span>
                    <span className={styles.srOnly}> (opens in a new tab)</span>
                  </a>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className={styles.empty} role="status">
          <strong>No matching resource.</strong>
          <button type="button" onClick={() => { setQuery(""); setActiveFilter("all"); }}>Clear filters</button>
        </div>
      )}

      <aside className={styles.note} aria-label="Copyright note">
        <span>UK readers</span>
        <p>Copyright status differs by country. Check the source record before downloading; use your local library for in-copyright titles.</p>
      </aside>
    </section>
  );
}
