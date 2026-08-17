import type { Metadata } from "next";
import { SiteNav } from "../components/SiteNav";
import { ResourcesDirectory } from "../../components/ResourcesDirectory";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Open Ebook Tools and UK Library Resources",
  description: "Official links to open-source ebook readers, public-domain catalogues and UK local library services.",
  alternates: { canonical: "/resources" },
};

export default function ResourcesPage() {
  return (
    <main className={styles.main}>
      <SiteNav active="resources" />
      <header className={styles.hero}>
        <p>DIRECTORY</p>
        <h1>Book tools.</h1>
        <div className={styles.intro}>
          <p>Software, catalogues and libraries.</p>
        </div>
      </header>
      <div id="resources">
        <ResourcesDirectory />
      </div>
      <footer className={styles.footer}>
        <a className={styles.brand} href="/" aria-label="LibreLeaf home"><span>libre</span>leaf</a>
        <p>Official project links.</p>
        <a href="/">Back to book search <span aria-hidden="true">→</span></a>
      </footer>
    </main>
  );
}
