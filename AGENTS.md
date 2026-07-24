# Repository working agreement

## Source of truth

- The runnable project is this repository.
- Product and release status live in `README.md` and `docs/`.
- Historical prototypes in `docs/design-archive/` are reference material, not runtime source.

## Change discipline

- Keep changes scoped to the requested feature or defect.
- Preserve existing UI language and layout unless the request explicitly calls for redesign.
- Never commit `.env*`, upload keys, private keys, tokens, production health data, or local test stores.
- Use reversible local fixtures for UI and workflow checks; do not alter production data for testing.
- Cloud function source changes are incomplete until the matching function is redeployed and verified.

## Required verification

- Run `npm run check` for code, configuration, action coverage, tests, and static release gates.
- Run `npm run check:release:production` only with locally completed production attestations.
- Report cloud deployment, permissions, privacy, multi-account, real-device, and reminder evidence separately.
- A static check is not evidence of a real-device or production workflow.

## Release process

- Update `CHANGELOG.md`, relevant docs, and the package version.
- Submit changes through a pull request; merge only after CI passes.
- Tag releases as `v<package version>`.
- Treat the CloudBase `/admin/` URL as the production admin entry.
- Treat GitHub Pages as a legacy demo only.
