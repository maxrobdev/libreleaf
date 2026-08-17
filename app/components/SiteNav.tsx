"use client";

import { useEffect, useId, useState } from "react";

import styles from "./SiteNav.module.css";

type SiteNavProps = {
  active?: "home" | "search" | "lists" | "brief" | "send" | "guides" | "developers" | "about" | "resources" | "saved";
  savedCount?: number;
  onSaved?: () => void;
};

const primaryLinks = [
  { label: "Search", href: "/", key: "search" },
  { label: "Lists", href: "/lists", key: "lists" },
  { label: "Guides", href: "/guides", key: "guides" },
] as const;

const toolLinks = [
  { label: "Briefleaf", detail: "RSS to EPUB", href: "/brief", key: "brief" },
  { label: "LibreSend", detail: "Device handoff", href: "/send", key: "send" },
  { label: "API + MCP", detail: "Build with LibreLeaf", href: "/developers", key: "developers" },
  { label: "Book tools", detail: "Readers and catalogues", href: "/resources", key: "resources" },
] as const;

export function SiteNav({ active, savedCount, onSaved }: SiteNavProps) {
  const [open, setOpen] = useState(false);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  const savedLabel = typeof savedCount === "number" && savedCount > 0 ? `Saved ${savedCount}` : "Saved";
  const linkIsActive = (key: string) => key === "search" ? active === "home" || active === "search" : active === key;

  return (
    <header className={styles.header}>
      <a className={styles.brand} href="/" aria-label="LibreLeaf home">
        <span>libre</span>leaf
      </a>

      <button
        className={styles.menuButton}
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={open ? "Close navigation" : "Open navigation"}
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true" />
        <span aria-hidden="true" />
      </button>

      <nav
        className={`${styles.nav} ${open ? styles.open : ""}`}
        id={menuId}
        aria-label="Main navigation"
      >
        {primaryLinks.map((link) => (
          <a
            className={linkIsActive(link.key) ? styles.active : undefined}
            href={link.href}
            aria-current={linkIsActive(link.key) ? "page" : undefined}
            key={link.key}
            onClick={() => setOpen(false)}
          >
            {link.label}
          </a>
        ))}

        <details className={styles.more}>
          <summary className={toolLinks.some((link) => link.key === active) ? styles.active : undefined}>
            Tools <span aria-hidden="true">↓</span>
          </summary>
          <div className={styles.moreMenu}>
            {toolLinks.map((link) => (
              <a
                className={active === link.key ? styles.active : undefined}
                href={link.href}
                aria-current={active === link.key ? "page" : undefined}
                key={link.key}
                onClick={() => setOpen(false)}
              >
                <strong>{link.label}</strong>
                {"detail" in link ? <small>{link.detail}</small> : null}
              </a>
            ))}
            <a className={styles.moreGithub} href="https://github.com/maxrobdev/libreleaf" target="_blank" rel="noreferrer">
              <strong>GitHub ↗</strong><small>Source and issues</small>
            </a>
          </div>
        </details>

        <a
          className={active === "about" ? styles.active : undefined}
          href="/about"
          aria-current={active === "about" ? "page" : undefined}
          onClick={() => setOpen(false)}
        >
          About
        </a>

        {onSaved ? (
          <button
            className={`${styles.saved} ${active === "saved" ? styles.active : ""}`}
            type="button"
            aria-current={active === "saved" ? "page" : undefined}
            onClick={() => {
              setOpen(false);
              onSaved();
            }}
          >
            {savedLabel}
          </button>
        ) : (
          <a
            className={`${styles.saved} ${active === "saved" ? styles.active : ""}`}
            href="/?view=saved"
            aria-current={active === "saved" ? "page" : undefined}
            onClick={() => setOpen(false)}
          >
            {savedLabel}
          </a>
        )}

      </nav>
    </header>
  );
}
