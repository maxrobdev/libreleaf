import { getGuide, guides, type Guide } from "../content/guides";
import styles from "./Guides.module.css";

const SITE_ORIGIN = "https://libreleaf-books.netlify.app";

function jsonLd(value: unknown) {
  return { __html: JSON.stringify(value).replace(/</g, "\\u003c") };
}

export function GuidesHub() {
  const categories = [...new Set(guides.map((guide) => guide.category))];
  return (
    <main className={styles.page}>
      <div className={styles.hub}>
        <header className={styles.hero}>
          <p className={styles.kicker}>GUIDES</p>
          <h1>Read on your device.</h1>
          <p>Formats, transfers, rights, source checks, API and MCP.</p>
        </header>
        <nav className={styles.filters} aria-label="Guide topics">
          {categories.map((category) => <a href={`#${category.toLowerCase()}`} key={category}>{category}</a>)}
        </nav>
        <section className={styles.grid} aria-label="LibreLeaf guides">
          {guides.map((guide) => (
            <a className={styles.card} href={`/guides/${guide.slug}`} id={guide.category.toLowerCase()} key={guide.slug}>
              <div className={styles.cardMeta}><span>{guide.category}</span><span>{guide.readingMinutes} min</span></div>
              <h2>{guide.title}</h2>
              <p>{guide.description}</p>
              <span>Read →</span>
            </a>
          ))}
        </section>
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd({
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "LibreLeaf guides",
        url: `${SITE_ORIGIN}/guides/`,
        inLanguage: "en-GB",
        hasPart: guides.map((guide) => ({ "@type": "Article", headline: guide.title, url: `${SITE_ORIGIN}/guides/${guide.slug}/` })),
      })} />
    </main>
  );
}

export function GuideArticle({ guide }: { guide: Guide }) {
  const related = guide.related.map(getGuide).filter((item): item is Guide => Boolean(item));
  const url = `${SITE_ORIGIN}/guides/${guide.slug}/`;
  return (
    <main className={styles.page}>
      <article className={styles.article}>
        <nav className={styles.crumbs} aria-label="Breadcrumb"><a href="/">Home</a><span>/</span><a href="/guides">Guides</a><span>/</span><span>{guide.category}</span></nav>
        <header className={styles.articleHeader}>
          <p className={styles.kicker}>{guide.category}</p>
          <h1>{guide.title}</h1>
          <p>{guide.description}</p>
          <div className={styles.articleMeta}><span>By {guide.author}</span><time dateTime={guide.updated}>Updated 16 August 2026</time><span>{guide.readingMinutes} min read</span></div>
        </header>
        <div className={styles.body}>
          {guide.sections.map((section) => (
            <section className={styles.section} key={section.heading}>
              <h2>{section.heading}</h2>
              {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              {section.steps ? <ol>{section.steps.map((step) => <li key={step}>{step}</li>)}</ol> : null}
              {section.bullets ? <ul>{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul> : null}
              {section.note ? <p className={styles.note}>{section.note}</p> : null}
            </section>
          ))}
          <section className={styles.references}>
            <h2>Sources</h2>
            <ul>{guide.references.map((reference) => <li key={reference.url}><a href={reference.url} target="_blank" rel="noreferrer">{reference.label}</a></li>)}</ul>
          </section>
          {related.length ? <section className={styles.related}><h2>Related</h2><div className={styles.relatedLinks}>{related.map((item) => <a href={`/guides/${item.slug}`} key={item.slug}>{item.title}</a>)}</div></section> : null}
          {guide.action ? <a className={styles.action} href={guide.action.href}>{guide.action.label}<span aria-hidden="true">→</span></a> : null}
        </div>
      </article>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd({
        "@context": "https://schema.org",
        "@type": "Article",
        headline: guide.title,
        description: guide.description,
        datePublished: guide.published,
        dateModified: guide.updated,
        author: { "@type": "Person", name: guide.author },
        publisher: { "@type": "Organization", name: "LibreLeaf", url: SITE_ORIGIN },
        mainEntityOfPage: url,
        inLanguage: "en-GB",
      })} />
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_ORIGIN}/` },
          { "@type": "ListItem", position: 2, name: "Guides", item: `${SITE_ORIGIN}/guides/` },
          { "@type": "ListItem", position: 3, name: guide.title, item: url },
        ],
      })} />
    </main>
  );
}
