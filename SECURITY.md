# Security Policy

## Supported versions

LibreLeaf is currently maintained on its latest published version. Security fixes are applied to the current `main` branch; older deployments may not receive patches.

## Report a vulnerability privately

Please do not open a public issue for a suspected vulnerability.

Use GitHub's [private vulnerability reporting](https://github.com/maxrobdev/libreleaf/security/advisories/new). Include, where possible:

- A concise description of the vulnerability and its impact
- The affected page, route, commit, or deployed version
- Reproduction steps or a minimal proof of concept
- Any suggested mitigation
- Whether the issue has been disclosed elsewhere

Please avoid accessing other people's data, degrading third-party catalogue services, or carrying out destructive testing. Use synthetic data and the smallest number of requests necessary to demonstrate the issue.

I will aim to acknowledge a report within 7 days, provide an initial assessment within 14 days, and keep the reporter informed while a fix is prepared. These are targets rather than guarantees for this volunteer-maintained project.

## In scope

- Cross-site scripting, request injection, or unsafe URL handling
- Exposure of secrets or private reader data
- Server-side request forgery or catalogue proxy abuse
- Dependency or deployment flaws with a demonstrated impact on LibreLeaf
- A result action that is misleading about its actual destination or behaviour

## Usually out of scope

- Availability, content, or policy issues on Project Gutenberg, Gutendex, or Open Library
- Automated scanner output without a reproducible impact
- Rate limiting or denial-of-service testing
- Social engineering, spam, or physical attacks
- Issues in unsupported browsers or modified deployments

## Content and rights reports

A book that appears incorrectly classified is important, but it is normally a content issue rather than a security vulnerability. Please use the content-report issue template and include the LibreLeaf result, source record, and reason for concern. Do not attach or redistribute the book file.
