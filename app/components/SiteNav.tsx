"use client";

import { useEffect, useId, useState } from "react";

import styles from "./SiteNav.module.css";

type SiteNavProps = {
  active?: "home" | "search" | "lists" | "about" | "resources" | "saved";
  savedCount?: number;
  onSaved?: () => void;
};

const links = [
  { label: "Home", href: "/", key: "home" },
  { label: "Search", href: "/search", key: "search" },
  { label: "Lists", href: "/lists", key: "lists" },
  { label: "About", href: "/about", key: "about" },
  { label: "Other tools", href: "/resources", key: "resources" },
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

  const savedLabel = typeof savedCount === "number" ? `Saved (${savedCount})` : "Saved";

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
        {links.map((link) => (
          <a
            className={active === link.key ? styles.active : undefined}
            href={link.href}
            aria-current={active === link.key ? "page" : undefined}
            key={link.key}
            onClick={() => setOpen(false)}
          >
            {link.label}
          </a>
        ))}

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
            href="/search?view=saved"
            aria-current={active === "saved" ? "page" : undefined}
            onClick={() => setOpen(false)}
          >
            {savedLabel}
          </a>
        )}

        <a
          className={styles.github}
          href="https://github.com/maxrobdev/libreleaf"
          target="_blank"
          rel="noreferrer"
          onClick={() => setOpen(false)}
        >
          GitHub <span aria-hidden="true">↗</span>
        </a>
      </nav>
    </header>
  );
}
