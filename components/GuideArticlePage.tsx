import { SiteNav } from "../app/components/SiteNav";
import { getGuide, type Guide } from "../content/guides";
import styles from "./Guides.module.css";

type GuideArticlePageProps = {
  guide: Guide;
  structuredData?: Record<string, unknown>[];
};

function humanDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

export function GuideArticlePage({ guide, structuredData }: GuideArticlePageProps) {
  return (
    <main className={styles.page}>
      <SiteNav />

      <article className={styles.article}>
        <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
          <a href="/">Home</a><span aria-hidden="true">/</span>
          <a href="/guides">Guides</a><span aria-hidden="true">/</span>
          <span aria-current="page">{guide.title}</span>
        </nav>

        <header className={styles.articleHeader}>
          <p className={styles.eyebrow}>{guide.category} guide</p>
          <h1>{guide.title}</h1>
          <p className={styles.description}>{guide.description}</p>
          <div className={styles.byline}>
            <span>By {guide.author}</span>
            <span>Published <time dateTime={guide.published}>{humanDate(guide.published)}</time></span>
            <span>{guide.readingMinutes} min read</span>
          </div>
        </header>

        <div className={styles.articleLayout}>
          <aside className={styles.contents} aria-label="On this page">
            <strong>On this page</strong>
            <ol>
              {guide.sections.map((section, index) => (
                <li key={section.heading}><a href={`#section-${index + 1}`}>{section.heading}</a></li>
              ))}
            </ol>
          </aside>

          <div className={styles.prose}>
            {guide.sections.map((section, index) => (
              <section id={`section-${index + 1}`} key={section.heading}>
                <h2>{section.heading}</h2>
                {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                {section.steps ? (
                  <ol>{section.steps.map((step) => <li key={step}>{step}</li>)}</ol>
                ) : null}
                {section.bullets ? (
                  <ul>{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>
                ) : null}
                {section.note ? <aside className={styles.note}><strong>Note</strong><p>{section.note}</p></aside> : null}
              </section>
            ))}

            {guide.action ? (
              <p className={styles.action}><a href={guide.action.href}>{guide.action.label}<span aria-hidden="true">→</span></a></p>
            ) : null}

            <section className={styles.references} aria-labelledby="references-title">
              <h2 id="references-title">References</h2>
              <ul>
                {guide.references.map((reference) => (
                  <li key={reference.url}><a href={reference.url} target="_blank" rel="noreferrer">{reference.label}<span className={styles.srOnly}> (opens in a new tab)</span></a></li>
                ))}
              </ul>
            </section>
          </div>
        </div>

        <section className={styles.related} aria-labelledby="related-guides-title">
          <div className={styles.groupHeading}>
            <h2 id="related-guides-title">Related guides</h2>
            <a href="/guides">All guides</a>
          </div>
          <div className={styles.relatedGrid}>
            {guide.related.map((slug) => {
              const relatedGuide = getGuide(slug);
              if (!relatedGuide) return null;
              return (
                <a href={`/guides/${relatedGuide.slug}`} key={relatedGuide.slug}>
                  <span>{relatedGuide.category}</span>
                  <strong>{relatedGuide.title}</strong>
                  <small>{relatedGuide.readingMinutes} min read</small>
                </a>
              );
            })}
          </div>
        </section>
      </article>

      <footer className={styles.footer}>
        <a className={styles.brand} href="/"><span>libre</span>leaf</a>
        <p>Last reviewed <time dateTime={guide.updated}>{humanDate(guide.updated)}</time>.</p>
        <a href="https://github.com/maxrobson/LibreLeaf" target="_blank" rel="noreferrer">Source on GitHub</a>
      </footer>

      {structuredData?.map((item, index) => (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(item).replace(/</g, "\\u003c") }}
          key={index}
        />
      ))}
    </main>
  );
}
