# Security review

Last reviewed: 17 August 2026

## Deployment authority

The repository contains no Netlify token, GitHub token, deploy key, account credential, or private key. Netlify's local state directory and all environment files are ignored. `netlify.toml` describes the public build and routes but contains no site ID or deployment authority. A clean checkout cannot deploy to the production account without separate provider authentication.

Tracked files and repository history were scanned for common GitHub, Netlify, AWS, private-key, and environment-file patterns. No credential matches were found. This is a point-in-time check, not a substitute for provider-side secret scanning and push protection.

## Trust boundaries

- Search, list, edition, MCP, RSS, and future API inputs must be bounded and validated.
- Server-side requests use fixed official origins or strict host allowlists. Reader-supplied arbitrary proxy targets are out of scope.
- Direct book links are allowlisted by protocol and source host before being returned.
- Source failures are isolated and do not gain control of response headers, cache keys, HTML, or scripts.
- Book files are linked at their source. The public LibreLeaf deployment does not proxy or store them.
- LibreSend local mode handles a selected file only in the browser. Its optional self-hosted relay is disabled on the public site; when configured elsewhere, the client uploads an AES-GCM encrypted envelope whose key remains in the link fragment.
- The reference LibreSend relay enforces exact origins, byte and lifetime caps, bounded request rates and destructive one-use retrieval. Encryption does not remove a relay operator's abuse, metadata, retention, takedown or jurisdiction responsibilities.
- Browser-saved items remain in local storage and are not an authentication or authorisation mechanism.

## Repository controls

- GitHub Actions have read-only repository permissions.
- Third-party workflow actions are pinned to immutable commits.
- Dependabot checks npm and GitHub Actions dependencies weekly.
- GitHub vulnerability alerts, secret scanning, push protection, and automated Dependabot security updates are enabled.
- Pull requests explicitly check for secrets, personal data, generated output, and copyrighted files.
- Security reports use GitHub private vulnerability reporting rather than public issues.

The `main` branch is not currently protected because this repository is still using a direct maintainer-push release workflow. Enabling required pull requests and required CI is a recommended follow-up once releases move to branches.

## Maintainer checks

Before a release:

1. Run `npm run check`.
2. Inspect `git diff --cached` and scan it for credentials.
3. Confirm `.env*`, `.netlify/`, build output, and local logs are untracked.
4. Review new outbound hosts, redirects, CORS, CSP, input limits, and cache keys.
5. Rotate a provider credential immediately if it is ever printed, committed, or shared outside its intended secret store.

See [SECURITY.md](../SECURITY.md) for private reporting instructions.
