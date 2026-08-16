import { SiteNav } from "./components/SiteNav";

const suggestions = ["Jane Austen", "Frankenstein", "Sherlock Holmes", "Virginia Woolf"];
const subjects = ["Gothic fiction", "Detective fiction", "Romantic poetry", "Victorian literature", "Natural history", "Philosophical essays"];

function searchUrl(query: string, by: "all" | "subject" = "all") {
  return `/search?q=${encodeURIComponent(query)}&by=${by}`;
}

export default function Home() {
  return (
    <main>
      <SiteNav active="home" />

      <section className="hero" id="top">
        <p className="eyebrow">OPEN CATALOGUE RESOLVER</p>
        <h1>Find an open book.</h1>
        <form className="search-box" action="/search" method="get">
          <span aria-hidden="true">⌕</span>
          <label className="sr-only" htmlFor="search-by">Search field</label>
          <select id="search-by" name="by" defaultValue="all">
            <option value="all">Anywhere</option>
            <option value="title">Title</option>
            <option value="author">Author</option>
            <option value="subject">Subject</option>
          </select>
          <label className="sr-only" htmlFor="search-region">Rights context</label>
          <select id="search-region" name="region" defaultValue="GB" title="Rights context">
            <option value="GB">UK context</option>
            <option value="US">US context</option>
            <option value="GLOBAL">Global / check locally</option>
          </select>
          <label className="sr-only" htmlFor="book-search">Search by title, author, or subject</label>
          <input id="book-search" name="q" placeholder="Title, author, or subject…" autoComplete="off" required />
          <button type="submit">Search</button>
        </form>
        <p className="hero-copy">Source-labelled routes from five open catalogues, with rights context.</p>
        <div className="suggestions"><span>Try</span>{suggestions.map((item) => <a key={item} href={searchUrl(item)}>{item}</a>)}</div>
        <div className="category-row" aria-label="Browse popular genres and subgenres">{subjects.map((item) => <a key={item} href={searchUrl(item, "subject")}>{item}</a>)}</div>
      </section>

      <section className="browse-links" aria-labelledby="browse-heading">
        <div>
          <p className="eyebrow">BROWSE</p>
          <h2 id="browse-heading">Open catalogue lists</h2>
        </div>
        <nav aria-label="Book lists">
          <a href="/lists">Trending titles <span aria-hidden="true">→</span></a>
          <a href="/lists">Free downloads <span aria-hidden="true">→</span></a>
          <a href="/lists">Borrow or preview <span aria-hidden="true">→</span></a>
        </nav>
      </section>

      <footer><a className="brand" href="#top"><span>libre</span>leaf</a><p>Open-source book search.</p><p>Data from Project Gutenberg, Open Library, Wikisource, DOAB and the Library of Congress.</p></footer>
    </main>
  );
}
