# LibreLeaf MCP server

LibreLeaf exposes a public, read-only MCP endpoint so ChatGPT, Codex, and other
MCP clients can search the same lawful catalogues as the web tool.

## Tool contract

`search_books(query, search_by?, limit?)` searches Project Gutenberg and Open
Library. `search_by` accepts `q`, `title`, `author`, or `subject`; `limit` is
bounded to 1–20 records. Results state whether each book is downloadable,
borrowable, or preview-only and include an absolute source URL.

The server has no authentication, user accounts, writes, or custom UI. It does
not request personal data; normal hosting request logs are covered by the public
privacy notice. Every tool is annotated:

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

The submission must describe Project Gutenberg and Open Library accurately.
LibreLeaf must never label Open Library borrow or preview records as unrestricted
downloads.
