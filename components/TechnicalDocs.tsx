import { getTechnicalDoc, technicalDocs, type TechnicalDoc } from "../content/technical-docs";
import styles from "./TechnicalDocs.module.css";

const SITE_ORIGIN = "https://libreleaf-books.netlify.app";

function humanDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function jsonLd(value: unknown) {
  return { __html: JSON.stringify(value).replace(/</g, "\\u003c") };
}

export function TechnicalDocsHub() {
  return (
    <main className={styles.page}>
      <div className={styles.hub}>
        <header className={styles.hero}>
          <p>DOCUMENTATION</p>
          <h1>Technical reference.</h1>
          <span>Resolver API, MCP, provenance, index and self-hosted tools.</span>
        </header>

        <section className={styles.grid} aria-label="LibreLeaf technical documentation">
          {technicalDocs.map((document) => (
            <a className={styles.card} href={`/docs/${document.slug}`} key={document.slug}>
              <span>{document.category}</span>
              <h2>{document.title}</h2>
              <p>{document.description}</p>
              <small>Reference →</small>
            </a>
          ))}
        </section>

        <aside className={styles.machine} aria-labelledby="machine-docs-title">
          <div>
            <h2 id="machine-docs-title">Machine-readable</h2>
            <p>Stable contracts and a plain-text documentation index.</p>
          </div>
          <div>
            <a href="/openapi.json">OpenAPI 3.1</a>
            <a href="/llms.txt">llms.txt</a>
            <a href="/llms-full.txt">Full text</a>
            <a href="/mcp">MCP endpoint</a>
          </div>
        </aside>
      </div>

      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd({
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "LibreLeaf technical documentation",
        description: "Technical reference for the LibreLeaf resolver API, MCP server, provenance model, open index, LibreSend and Briefleaf.",
        url: `${SITE_ORIGIN}/docs/`,
        inLanguage: "en-GB",
        hasPart: technicalDocs.map((document) => ({
          "@type": "TechArticle",
          headline: document.title,
          url: `${SITE_ORIGIN}/docs/${document.slug}/`,
        })),
      })} />
    </main>
  );
}

export function TechnicalDocArticle({ document }: { document: TechnicalDoc }) {
  const url = `${SITE_ORIGIN}/docs/${document.slug}/`;
  const related = document.related.map(getTechnicalDoc).filter((item): item is TechnicalDoc => Boolean(item));

  return (
    <main className={styles.page}>
      <article className={styles.article}>
        <nav className={styles.crumbs} aria-label="Breadcrumb">
          <a href="/">Home</a><span aria-hidden="true">/</span>
          <a href="/docs">Docs</a><span aria-hidden="true">/</span>
          <span aria-current="page">{document.category}</span>
        </nav>

        <header className={styles.articleHeader}>
          <p>{document.category.toUpperCase()}</p>
          <h1>{document.title}</h1>
          <span>{document.description}</span>
          <time dateTime={document.updated}>Updated {humanDate(document.updated)}</time>
        </header>

        <div className={styles.articleLayout}>
          <aside className={styles.contents} aria-label="On this page">
            <strong>On this page</strong>
            <ol>
              {document.sections.map((section, index) => (
                <li key={section.heading}><a href={`#section-${index + 1}`}>{section.heading}</a></li>
              ))}
            </ol>
          </aside>

          <div className={styles.prose}>
            {document.sections.map((section, index) => (
              <section id={`section-${index + 1}`} key={section.heading}>
                <h2>{section.heading}</h2>
                {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                {section.bullets ? <ul>{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul> : null}
                {section.code ? <pre><code>{section.code}</code></pre> : null}
                {section.note ? <aside className={styles.note}>{section.note}</aside> : null}
              </section>
            ))}

            <section className={styles.references} aria-labelledby="references-title">
              <h2 id="references-title">References</h2>
              <ul>
                {document.references.map((reference) => (
                  <li key={reference.url}>
                    <a href={reference.url} target={reference.url.startsWith("http") ? "_blank" : undefined} rel={reference.url.startsWith("http") ? "noreferrer" : undefined}>{reference.label}</a>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>

        <section className={styles.related} aria-labelledby="related-docs-title">
          <div><h2 id="related-docs-title">Related documentation</h2><a href="/docs">All docs</a></div>
          <nav aria-label="Related technical documentation">
            {related.map((item) => <a href={`/docs/${item.slug}`} key={item.slug}><span>{item.category}</span><strong>{item.title}</strong></a>)}
          </nav>
        </section>
      </article>

      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd({
        "@context": "https://schema.org",
        "@type": "TechArticle",
        headline: document.title,
        description: document.description,
        datePublished: "2026-08-17",
        dateModified: document.updated,
        author: { "@type": "Person", name: "Max Robson" },
        publisher: { "@type": "Organization", name: "LibreLeaf", url: SITE_ORIGIN },
        mainEntityOfPage: url,
        inLanguage: "en-GB",
      })} />
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd({
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_ORIGIN}/` },
          { "@type": "ListItem", position: 2, name: "Documentation", item: `${SITE_ORIGIN}/docs/` },
          { "@type": "ListItem", position: 3, name: document.title, item: url },
        ],
      })} />
    </main>
  );
}
