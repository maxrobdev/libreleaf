# LibreSend Local community release copy

These are maintainer drafts, not automatically published posts. Check each community's rules, disclose that you maintain LibreLeaf, answer technical questions directly, and do not repost the same text across unrelated groups.

## Reddit draft

### Title

I built a local web app for sending one EPUB or PDF to a phone or Kobo over Wi-Fi

### Body

I maintain LibreLeaf, an open-source resolver for lawful book access. I have added LibreSend Local because the usual ebook handoff instructions were either cloud-dependent or assumed a full library server.

Run `npx --yes github:maxrobdev/libreleaf`. It opens a private localhost interface. Choose one EPUB, PDF or MOBI and it exposes only that file at a random 15-minute address on the current Wi-Fi, plus a one-entry OPDS feed. The receiving page has no JavaScript and the process removes its temporary file on replacement, removal, expiry or shutdown.

It is not a Kindle API. Kindle delivery uses the Kindle app share target, Amazon's web uploader or approved email. Kobo browser support varies, so the official USB route remains the fallback. Local HTTP is for a trusted network only.

Source: https://github.com/maxrobdev/libreleaf

User guide: https://libreleaf-books.netlify.app/guides/send-books-over-wifi-libresend/

I would value reports from specific Kobo models and firmware, especially whether the direct attachment and byte-range behaviour work as expected.

## Show HN draft

### Title

Show HN: LibreSend Local – one-file ebook handoff over Wi-Fi and OPDS

### Body

LibreSend Local is a dependency-free Node application with a localhost web UI. It accepts one bounded EPUB/PDF/MOBI, writes a mode-0600 temporary file and serves only that file through a random expiring LAN path. The receiver is no-script HTML; downloads support HEAD and byte ranges; an OPDS 1 acquisition feed points to the same file. The control server is loopback-only and the LAN server has no upload or CORS surface.

It is part of LibreLeaf but can be run independently with `npx --yes github:maxrobdev/libreleaf`. Kindle remains on Amazon's supported app/web/email paths; Kobo has the browser route with an explicit USB fallback.

Code: https://github.com/maxrobdev/libreleaf

## GitHub release summary

LibreSend Local adds a first-party localhost interface for one-file EPUB/PDF/MOBI handoff. This release also adds destination-specific Kindle and Kobo instructions, a static e-reader fallback on `/send`, a no-script LAN receiver, OPDS acquisition, byte ranges, bounded mode-0600 temporary storage and focused end-to-end tests.
