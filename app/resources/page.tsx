import type { Metadata } from "next";
import Link from "next/link";
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
        <p>OTHER TOOLS &amp; RESOURCES</p>
        <h1>Read, manage<br />and borrow books.</h1>
        <div className={styles.intro}>
          <p>Open-source software, open catalogues and official UK library routes.</p>
          <a href="#resources">Skip to directory <span aria-hidden="true">↓</span></a>
        </div>
      </header>
      <div id="resources">
        <ResourcesDirectory />
      </div>
      <footer className={styles.footer}>
        <Link className={styles.brand} href="/" aria-label="LibreLeaf home"><span>libre</span>leaf</Link>
        <p>Independent projects retain their own terms and policies.</p>
        <Link href="/">Back to book search <span aria-hidden="true">→</span></Link>
      </footer>
    </main>
  );
}
