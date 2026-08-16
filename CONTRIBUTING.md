# Contributing to LibreLeaf

Thank you for helping me make lawful, free books easier for people to find. I welcome focused fixes, accessibility improvements, tests, documentation, and integrations with reputable public-domain or properly licensed catalogues.

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Before you start

For a small correction, feel free to open a pull request directly. For a larger feature, new catalogue, or architectural change, please open an issue first so we can agree on the problem and scope before either of us spends significant time on it.

A proposed catalogue source should:

- Have a clear, credible basis for distributing or linking to its material
- Identify whether an item is downloadable, borrowable, or preview-only
- Offer stable documentation or a supported API where practical
- Allow LibreLeaf to present honest source attribution
- Not primarily facilitate access to unauthorised copies

LibreLeaf intentionally excludes piracy-focused torrent indexes, shadow libraries, and deceptive download intermediaries. Contributions adding or disguising those sources will not be accepted.

## Local development

You will need Node.js 22.13 or later and npm.

```bash
git clone https://github.com/maxrobdev/libreleaf.git
cd libreleaf
npm install
npm run dev
```

Before submitting a change, run the relevant checks:

```bash
npm run lint
npm run build
npm test
```

If a check fails for a reason unrelated to your change, explain it clearly in the pull request rather than silently skipping it.

## Making a good change

- Keep each pull request focused on one problem.
- Preserve the distinction between **download**, **borrow**, and **preview**.
- Keep source names and destination URLs visible and trustworthy.
- Use UK English in reader-facing copy and documentation.
- Keep the interface usable by keyboard and assistive technology.
- Avoid adding tracking, dark patterns, account requirements, or unnecessary dependencies.
- Add or update tests when behaviour changes.
- Never commit credentials, private reader data, generated build output, or dependency folders.

For catalogue integrations, handle timeouts and partial outages gracefully. One unavailable source should not prevent a healthy source from returning results.

## Commit and pull request guidance

Use short, descriptive commit messages, for example:

```text
fix: label preview-only Open Library results
feat: add keyboard focus to format menu
docs: clarify ebook rights by country
```

In your pull request, explain:

- What problem you are solving
- What changed
- How you tested it
- Any privacy, accessibility, rights, or third-party API considerations
- Screenshots for visible interface changes

By contributing, you agree that your contribution will be licensed under the project's [MIT Licence](LICENSE).
