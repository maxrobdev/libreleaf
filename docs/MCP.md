# LibreLeaf MCP server

LibreLeaf exposes a public, read-only MCP endpoint so ChatGPT, Codex, and other
MCP clients can query the same catalogues as the web tool.

## Tool contract

`search(query)` and `fetch(id)` implement OpenAI's read-only compatibility
contract for ChatGPT research and company knowledge. `search` returns only a
stable LibreLeaf work ID, title and canonical citation URL. `fetch` refreshes
that ID against the catalogues and returns the complete resolver record as both
structured content and the same JSON-encoded text content. Its record includes
authors, provenance, source-labelled routes, rights context and partial-source
status; it does not return or reproduce a book's copyrighted text.

Stable IDs are produced by the shared web/API identity module from normalized work title and primary author. For a
record without usable author metadata, the ID also retains its source and
source record ID. This makes IDs independent of whichever catalogue answered
first while avoiding title-only merges. Citation URLs select and open that exact
work in the browser resolver.

`search_books(query, search_by?, limit?, region?)` searches Project Gutenberg,
Open Library, Wikisource, DOAB and the Library of Congress. `search_by` accepts `q`, `title`, `author`, or
`subject`; `limit` is bounded to 1–20 records. Results preserve download,
borrow, preview, read and listen access types and include validated source URLs.

`resolve_access(title, author?, region?)` returns one canonical best match plus
every validated offer attached to that work. The result includes:

- each offer's source, access type, URL, format and rights metadata where supplied;
- the source records retained in the canonical match;
- an `exact`, `strong`, `possible`, or `none` match quality;
- the numeric ranking score, candidate count and a plain-language explanation.

The resolver normalises title and optional-author metadata, then uses source and
route counts only as tie-breakers. Its explanation makes that ordering
auditable. A separate `explain_result` tool is deliberately omitted because the
resolver already returns the underlying match reasons and ranking method.

The focused tools accept `region` as `GB`, `US`, or `GLOBAL`. Region changes the rights
context reported by sources; it does not make a legal determination. In
particular, Project Gutenberg's public-domain assessment is US-specific unless
an offer supplies separate applicable rights metadata.

The server has no authentication, user accounts, writes, or custom UI. It does
not request personal data; normal hosting request logs are covered by the public
privacy notice. All four tools are annotated:

- `readOnlyHint: true`
- `destructiveHint: false`
- `openWorldHint: true`

## Endpoint

Netlify maps the stable production endpoint
`https://libreleaf-books.netlify.app/mcp` to `netlify/functions/mcp.ts`. The
handler uses the official `@modelcontextprotocol/sdk` Web Standard Streamable
HTTP transport in stateless JSON-response mode.

For local inspection, start a Netlify-compatible development server and point
MCP Inspector at `http://localhost:8888/mcp`:

```sh
npx netlify dev
npx @modelcontextprotocol/inspector
```

Run the offline protocol and tool tests with:

```sh
npm run test:mcp
```

## ChatGPT connection and submission

After deploying to a stable public HTTPS origin, connect the `/mcp` URL in
ChatGPT developer mode and run MCP Inspector against production. Public plugin
submission also requires a verified OpenAI developer or business identity,
public website/support/privacy/terms URLs, domain verification, starter prompts,
and documented positive and negative test cases. No OAuth is needed while the
server remains public and read-only.

The submission must describe all five sources accurately. LibreLeaf must never
label borrow, preview, read or listen records as downloads, and must not present
a source-jurisdiction assessment as globally applicable.

The standard tool shapes follow OpenAI's current
[MCP compatibility guidance](https://developers.openai.com/api/docs/mcp), and
the deployment checklist follows the current
[plugin MCP server guidance](https://developers.openai.com/plugins/build/mcp-server#deploy-the-endpoint).
