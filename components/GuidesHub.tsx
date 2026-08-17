import { SiteNav } from "../app/components/SiteNav";
import { guides } from "../content/guides";
import styles from "./Guides.module.css";

const categories = ["Devices", "Rights", "Research", "Developers", "Formats"] as const;

export function GuidesHub() {
  return (
    <main className={styles.page}>
      <SiteNav />
      <header className={styles.hubHeader}>
        <p className={styles.eyebrow}>Guides</p>
        <h1>Read, transfer, and verify open books</h1>
        <p>Practical instructions for book files, devices, rights checks, and LibreLeaf developer tools.</p>
      </header>

      <nav className={styles.jumpNav} aria-label="Guide categories">
        {categories.map((category) => (
          <a href={`#${category.toLowerCase()}`} key={category}>{category}</a>
        ))}
      </nav>

      <div className={styles.guideGroups}>
        {categories.map((category) => {
          const categoryGuides = guides.filter((guide) => guide.category === category);
          if (!categoryGuides.length) return null;

          return (
            <section id={category.toLowerCase()} className={styles.guideGroup} key={category}>
              <div className={styles.groupHeading}>
                <h2>{category}</h2>
                <span>{categoryGuides.length} {categoryGuides.length === 1 ? "guide" : "guides"}</span>
              </div>
              <div className={styles.guideGrid}>
                {categoryGuides.map((guide, index) => (
                  <article className={styles.guideCard} key={guide.slug}>
                    <div className={styles.cardMeta}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <span>{guide.readingMinutes} min</span>
                    </div>
                    <h3><a href={`/guides/${guide.slug}`}>{guide.title}</a></h3>
                    <p>{guide.description}</p>
                    <a className={styles.cardLink} href={`/guides/${guide.slug}`} aria-label={`Read ${guide.title}`}>
                      Read guide <span aria-hidden="true">→</span>
                    </a>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <footer className={styles.footer}>
        <a className={styles.brand} href="/"><span>libre</span>leaf</a>
        <p>Open-source book access resolver.</p>
        <a href="/about">About and source policy</a>
      </footer>
    </main>
  );
}
