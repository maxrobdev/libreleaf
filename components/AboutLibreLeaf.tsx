"use client";

import styles from "./AboutLibreLeaf.module.css";

const GITHUB_URL = "https://github.com/maxrobdev/libreleaf";

// Add the verified account URL here when one exists. Never guess a support handle.
export const BUY_ME_A_COFFEE_URL: string | null = null;

const principles = [
  {
    number: "01",
    title: "Clear routes",
    copy: "Every action says what happens next: download, preview, borrow, or open the source record.",
  },
  {
    number: "02",
    title: "Open code",
    copy: "The code is public. Inspect it, report a problem, propose a change, or run your own copy.",
  },
  {
    number: "03",
    title: "Lawful access",
    copy: "Direct files come from editions their source marks as freely downloadable. Library books stay library books.",
  },
];

function ArrowIcon() {
  return <span aria-hidden="true">↗</span>;
}

function GitHubIcon() {
  return <span aria-hidden="true">GH</span>;
}

export default function AboutLibreLeaf() {
  return (
    <main className={styles.page}>
      <section className={styles.hero} aria-labelledby="about-title">
        <div className={styles.heroIndex} aria-hidden="true">
          01 / ABOUT
        </div>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>PROJECT INFORMATION</p>
          <h1 id="about-title">About LibreLeaf</h1>
          <p className={styles.lede}>
            We think information should be easy to find. LibreLeaf maps lawful routes to public-domain
            downloads and library lending, in plain English.
          </p>
          <div className={styles.heroActions}>
            <a className={styles.primaryButton} href="/">
              Find a book <ArrowIcon />
            </a>
            <a className={styles.textLink} href={GITHUB_URL} target="_blank" rel="noreferrer">
              View the source <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>
        <aside className={styles.definition} aria-label="LibreLeaf project definition">
          <span className={styles.definitionMark}>L/</span>
          <dl>
            <div>
              <dt>Type</dt>
              <dd>Public utility</dd>
            </div>
            <div>
              <dt>Price</dt>
              <dd>Free</dd>
            </div>
            <div>
              <dt>Licence</dt>
              <dd>MIT</dd>
            </div>
            <div>
              <dt>Sources</dt>
              <dd>Open catalogues</dd>
            </div>
          </dl>
        </aside>
      </section>

      <section className={styles.statement} aria-labelledby="position-title">
        <p className={styles.eyebrow}>SOURCE POLICY</p>
        <div>
          <h2 id="position-title">What LibreLeaf indexes</h2>
          <div className={styles.statementCopy}>
            <p>
              LibreLeaf does not sell books, access, or attention. It searches public catalogues and
              points readers to the source.
            </p>
            <p>
              No mystery buttons. No bundled downloader. No claim that every book is free to keep.
              Public-domain files are downloads; controlled titles remain previews or library loans.
            </p>
          </div>
        </div>
      </section>

      <section className={styles.principles} aria-labelledby="principles-title">
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>HOW IT WORKS</p>
          <h2 id="principles-title">Three rules.</h2>
        </div>
        <div className={styles.principleGrid}>
          {principles.map((principle) => (
            <article key={principle.number} className={styles.principleCard}>
              <span>{principle.number}</span>
              <h3>{principle.title}</h3>
              <p>{principle.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.openSource} aria-labelledby="open-title">
        <div className={styles.openSourceIcon}>
          <GitHubIcon />
        </div>
        <div>
          <p className={styles.eyebrow}>OPEN SOURCE</p>
          <h2 id="open-title">Source code and contributions</h2>
          <p>
            LibreLeaf is open source under the MIT licence. Issues, fixes, accessibility work, and new
            lawful catalogue integrations are welcome.
          </p>
        </div>
        <a className={styles.inverseButton} href={GITHUB_URL} target="_blank" rel="noreferrer">
          Open GitHub <ArrowIcon />
        </a>
      </section>

      <section className={styles.support} aria-labelledby="support-title">
        <div>
          <p className={styles.eyebrow}>SUPPORT</p>
          <h2 id="support-title">Support the project</h2>
        </div>
        <div className={styles.supportAction}>
          <p>Contributions help cover infrastructure and keep LibreLeaf independent.</p>
          {BUY_ME_A_COFFEE_URL ? (
            <a className={styles.primaryButton} href={BUY_ME_A_COFFEE_URL} target="_blank" rel="noreferrer">
              Buy me a coffee <ArrowIcon />
            </a>
          ) : (
            <span className={styles.disabledButton} aria-disabled="true">
              Support link coming soon
            </span>
          )}
        </div>
      </section>

      <footer className={styles.footer}>
        <a className={styles.brand} href="/" aria-label="LibreLeaf home">
          <span>libre</span>leaf
        </a>
        <p>Open-source book discovery.</p>
        <div>
          <a href="/">Search</a>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer">
            Source
          </a>
        </div>
      </footer>
    </main>
  );
}
