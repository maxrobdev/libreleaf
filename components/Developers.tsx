import styles from "./Developers.module.css";

const searchExample = `curl 'https://libreleaf-books.netlify.app/api/v1/search?q=frankenstein&by=title&region=GB'`;

const resolveExample = `const page = await fetch(
  "https://libreleaf-books.netlify.app/api/v1/search?q=frankenstein&by=title&region=GB"
).then((response) => response.json());

const work = await fetch(
  \`https://libreleaf-books.netlify.app/api/v1/works/\${page.books[0].canonicalId}?region=GB\`
).then((response) => response.json());`;

const endpoints = [
  ["GET", "/api/v1/search", "Search and page every catalogue."],
  ["GET", "/api/v1/works/{workId}", "Resolve one canonical work and its routes."],
  ["GET", "/api/v1/editions", "Load Open Library editions on demand."],
  ["GET", "/api/v1/lists", "Read the live-list feed states."],
] as const;

export function Developers() {
  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <p>DEVELOPERS</p>
        <h1>Resolver API.</h1>
        <div className={styles.heroLinks}>
          <a href="/openapi.json">OpenAPI JSON</a>
          <a href="https://github.com/maxrobdev/libreleaf/blob/main/docs/API.md" target="_blank" rel="noreferrer">API notes ↗</a>
          <a href="/mcp">MCP endpoint</a>
          <a href="https://github.com/maxrobdev/libreleaf/blob/main/docs/LIBRESEND.md" target="_blank" rel="noreferrer">LibreSend framework ↗</a>
        </div>
      </header>

      <section className={styles.section} aria-labelledby="endpoints-title">
        <div className={styles.sectionTitle}>
          <h2 id="endpoints-title">Endpoints</h2>
          <span>v1 · read only · no key</span>
        </div>
        <div className={styles.endpoints}>
          {endpoints.map(([method, path, job]) => (
            <article key={path}>
              <code>{method}</code>
              <strong>{path}</strong>
              <p>{job}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.examples} aria-label="API examples">
        <article>
          <h2>Search</h2>
          <pre><code>{searchExample}</code></pre>
          <p>Pass the returned opaque <code>nextCursor</code> unchanged until it is <code>null</code>.</p>
        </article>
        <article>
          <h2>Resolve</h2>
          <pre><code>{resolveExample}</code></pre>
          <p>Keep <code>offers</code>, <code>sourceRecords</code>, rights notes and source status together.</p>
        </article>
      </section>

      <section className={styles.contract} aria-labelledby="contract-title">
        <div>
          <h2 id="contract-title">Contract</h2>
          <p>GB, US and GLOBAL select the displayed rights context. They do not provide legal clearance.</p>
        </div>
        <ul>
          <li>CORS is open for read-only clients.</li>
          <li>Results can be partial when a source is slow.</li>
          <li>Failed source cursors do not advance.</li>
          <li>Cache responses and retry with backoff.</li>
          <li>Do not infer rights beyond each offer note.</li>
        </ul>
      </section>

      <section className={styles.mcp} aria-labelledby="mcp-title">
        <div>
          <p>MCP</p>
          <h2 id="mcp-title">Use the same resolver from an AI client.</h2>
        </div>
        <div>
          <code>https://libreleaf-books.netlify.app/mcp</code>
          <a href="/guides/use-libreleaf-mcp">Setup guide →</a>
        </div>
      </section>

      <section className={styles.mcp} aria-labelledby="libresend-title">
        <div>
          <p>LIBRESEND</p>
          <h2 id="libresend-title">Self-host encrypted file handoff.</h2>
        </div>
        <div>
          <code>handleLibreSendRelayRequest()</code>
          <a href="https://github.com/maxrobdev/libreleaf/blob/main/docs/LIBRESEND.md" target="_blank" rel="noreferrer">Protocol and adapters ↗</a>
        </div>
      </section>
    </main>
  );
}
