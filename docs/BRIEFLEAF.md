# Briefleaf source and safety policy

Briefleaf turns a small, reviewed set of publisher-controlled RSS feeds into a personal EPUB and browser reader.

## Reviewed registry

The source registry is code-reviewed in `lib/brief/registry.ts`. Users choose a country and topic; they cannot submit a URL for the server to fetch.

| Region | Publishers in the registry | Available topics |
| --- | --- | --- |
| United Kingdom | BBC News, The Guardian | Top, world, business, technology, science and environment |
| United States | NPR | Top, world, business, technology, science |
| Canada | Global News Canada | Top, world, business, technology |
| Australia | SBS News | Top, world |
| New Zealand | RNZ | Top, world, business, technology, science and environment |
| Ireland | RTÉ News | Top, world, business, technology |
| Global | UN News, BBC News and NPR | Top, world, business, technology, science |

Every registry entry records the exact feed URL, publisher homepage, permitted article hostnames, and publisher terms page. Inclusion is a technical source choice, not an endorsement or a claim that feed content has an open licence.

## Content boundary

An edition can contain only fields supplied in the feed:

- headline;
- publication date, when supplied;
- a plain-text summary capped at 80 words and 480 characters;
- publisher-supplied RSS article text, when present, capped at 12,000 characters;
- publisher name; and
- an HTTPS link to the original report on a reviewed publisher hostname.

Briefleaf reads full-content RSS elements such as `content:encoded` and Atom `content` only when the publisher includes them in the reviewed feed. It strips markup, scripts, styles and embedded media, then caps the resulting text. It never fetches article pages, bypasses paywalls, or claims that a summary-only feed contains a full article. Every item retains its publisher link. Publishers retain their rights and readers remain responsible for complying with publisher terms.

## Server-fetch controls

The server fetcher applies all of these controls before an item reaches the preview or EPUB:

- exact, static feed URL registry and HTTPS only;
- redirects rejected, preventing a reviewed URL from redirecting to an unreviewed host;
- 2.5 second deadline per source;
- 256 KiB response cap per feed, enforced from both `Content-Length` and the streamed body;
- XML, RSS, Atom, or plain-text content types only;
- DTD and entity declarations rejected;
- at most four feeds fetched per request, 30 entries parsed per feed, and 24 items emitted;
- script, style, markup, and control characters removed from feed text;
- article links restricted to the entry's reviewed hostname allowlist;
- source failures isolated so another successful feed can still make an edition; and
- five-minute fresh cache with a one-hour stale-on-error window.

No feed content is uploaded by a user or stored as an account library. The cache is process-local and bounded by the reviewed registry.

## EPUB contract

The generated file is an EPUB 3 ZIP container. `mimetype` is the first uncompressed entry, and the archive includes the required container document, package manifest, navigation document, and one XHTML reading document. All feed-derived strings are XML-escaped. There is no JavaScript or remote asset in the EPUB.

`tests/brief.test.ts` verifies feed-text sanitisation, hostname rejection, partial-source success, cache use, required EPUB structure, and the publisher-supplied content boundary.

## Operations

Source availability is reported separately as live, cached, stale fallback, or unavailable, with a check timestamp. An upstream timeout must not block other sources. Registry changes require the same review as application code and should include:

1. confirmation that the feed is controlled by the named publisher;
2. a stable publisher terms URL;
3. the narrowest article-host allowlist that accepts current items;
4. a live timing and response-size check; and
5. a fixture or parser test for any materially different feed format.
