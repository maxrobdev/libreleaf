# Source and rights policy

LibreLeaf resolves catalogue records; it does not decide copyright status. Search results keep each source record, route type, language, publisher country where supplied, rights note, and the selected UK/US/Global context.

## Sources

| Source | Official interface | Route types | Rights handling |
| --- | --- | --- | --- |
| Project Gutenberg via Gutendex | `https://gutendex.com/` | Download, read | Gutenberg's public-domain assessment is US-based. US context is marked source-verified; other contexts remain source-jurisdiction-only. |
| Open Library | `https://openlibrary.org/developers/api` | Borrow, preview | Availability is edition- and location-dependent. No public-domain conclusion is inferred. |
| Wikisource | `https://en.wikisource.org/w/api.php` using the official MediaWiki Action API | Read | Wikisource accepts public-domain or freely licensed texts, but the applicable tag can vary by work and country. Language is not treated as proof of jurisdiction. |
| Directory of Open Access Books (DOAB) | `https://directory.doabooks.org/rest/search` | Read, or download only when the supplied URL is an identifiable file | DOAB records are open access. LibreLeaf shows the publisher-supplied licence URL when present; licence conditions still apply. |
| Library of Congress | `https://www.loc.gov/books/?fo=json` using the official loc.gov JSON/YAML API | Read, or download when an unrestricted digitized record supplies an explicit PDF | A Library of Congress access route is not treated as proof of public-domain status. Source-supplied rights information is retained, and applicability remains `check-local`. |

The Wikisource, DOAB, and Library of Congress integrations require no API key. They use documented JSON endpoints, an identifying user agent, bounded page sizes and timeouts, CDN caching, and independent failure states. LibreLeaf does not scrape HTML pages.

The Library of Congress integration requests only the `pagination` and `results` response attributes and filters for digitized, unrestricted records. It still validates every returned item and only exposes files hosted on `loc.gov` domains. The Library's own API documentation notes that the books endpoint is best for digitized books rather than complete catalogue coverage.

Open Library and DOAB remain retryable when they time out; their cursors are not advanced or marked exhausted. In each resolver request, Open Library is bounded to a two-second attempt plus one one-second retry, while DOAB is bounded to 2.5 seconds. This keeps a stalled catalogue from delaying healthy Gutendex, Wikisource, or Library of Congress results indefinitely.

## Rights context

The API accepts `region=GB`, `region=US`, or `region=GLOBAL` (default: `GB`). This changes the explanation attached to offers, not the underlying law. Offer applicability is one of:

- `verified`: the source's stated US assessment matches US context, or an explicit open licence URL is present;
- `source-jurisdiction-only`: the source assessment is tied to a different jurisdiction;
- `check-local`: the catalogue does not provide enough information for that context.

`source-provided-access` means a trusted source exposes an item or file but has not supplied enough evidence for LibreLeaf to call it public domain or openly licensed in the selected context. It always resolves to `check-local`.

These labels are provenance signals, not legal advice. Unsupported countries use the Global context rather than an invented copyright calculation.
