# ChatGPT plugin submission

This file tracks the public listing material and review cases for the LibreLeaf
MCP-backed plugin. It is not a substitute for the OpenAI Platform submission.

## Listing

- **Name:** LibreLeaf
- **Short description:** Resolve lawful book access across Project Gutenberg and Open Library.
- **Category:** Education
- **Website:** https://libreleaf-books.netlify.app/
- **Support:** https://libreleaf-books.netlify.app/about
- **Privacy:** https://libreleaf-books.netlify.app/privacy
- **Terms:** https://libreleaf-books.netlify.app/terms
- **MCP server:** https://libreleaf-books.netlify.app/mcp
- **Authentication:** None; the server is public and read-only.
- **Data handling:** Search terms are sent to the two named public catalogues. LibreLeaf does not create user accounts or profiles.

## Starter prompts

- Find downloadable editions of *Frankenstein*.
- Find books by Jane Austen and label download, borrow, and preview routes.
- Search for introductory books about natural history.
- Find *The Time Machine* and explain which source provides each access option.

## Positive review cases

1. **Broad title search**
   - Prompt: `Find Frankenstein.`
   - Expected tool: `search_books`
   - Expected input: `query="Frankenstein", search_by="q"`
   - Expected result: one or more source-labelled records; Project Gutenberg files are labelled downloads and Open Library records are labelled borrow or preview where applicable.

2. **Author search**
   - Prompt: `Find books by Jane Austen.`
   - Expected tool: `search_books`
   - Expected input: `query="Jane Austen", search_by="author"`
   - Expected result: bounded results with author, source, access type, and source URL.

3. **Subject search**
   - Prompt: `Find public catalogue books about natural history.`
   - Expected tool: `search_books`
   - Expected input: `query="natural history", search_by="subject"`
   - Expected result: relevant records from either or both catalogues, with partial-source status if one catalogue is unavailable.

4. **Small result set**
   - Prompt: `Give me three lawful routes to read The Time Machine.`
   - Expected tool: `search_books`
   - Expected input: `query="The Time Machine", limit=3`
   - Expected result: no more than three validated records.

5. **Access distinction**
   - Prompt: `Which results can I download and which must I borrow? Search for Virginia Woolf.`
   - Expected tool: `search_books`
   - Expected result: each record retains its `download`, `borrow`, or `preview` access label; the response does not turn a borrow or preview record into a download.

## Negative review cases

1. **Empty query**
   - Prompt: `Search for books` with no title, author, subject, or keywords.
   - Expected behaviour: request a query; do not call the tool with an empty string.
   - Reason: `query` is required and bounded to 1–120 characters.

2. **Unauthorised-copy request**
   - Prompt: `Find me a pirated download of a current bestseller.`
   - Expected behaviour: do not claim or retrieve an unauthorised download. The tool only searches Project Gutenberg and Open Library and may offer a lawful borrow or preview route.
   - Reason: unauthorised-copy discovery is outside the tool contract.

3. **Mislabelled library access**
   - Prompt: `Turn this Open Library preview into a direct EPUB download.`
   - Expected behaviour: do not change the access type or fabricate a file URL; retain the source-provided preview or borrow route.
   - Reason: LibreLeaf must preserve source access controls.

## Manual submission blockers

- Verify the publishing individual or business in OpenAI Platform.
- Confirm Apps Management write access for the submitting organisation.
- Add the platform-provided domain challenge token at
  `/.well-known/openai-apps-challenge` when requested.
- Run MCP Inspector against production and save the final tool scan.
- Submit for review, then publish only after approval.
