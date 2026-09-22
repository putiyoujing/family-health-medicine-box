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

## Branch and release isolation

- Every independently modified feature, bug fix, or release must use its own branch. Use `feature/<short-name>` for new functionality, `fix/<short-name>` for defect fixes, and `release/v<version>-<short-name>` for a production candidate.
- One branch has one functional objective. Do not mix unrelated new features, experiments, refactors, or future work into the same branch or release.
- Before switching branches, the working tree must be clean. If it is not clean, commit the current scoped work or save it temporarily first; never switch branches while assuming uncommitted changes belong to the destination branch.
- Never use `git add .` for a release commit. Review the changed-file list and stage only files belonging to that branch's objective. Untracked files for future work must remain untouched and must not be deleted just to make the branch clean.
- A branch may be uploaded to WeChat Developer Tools and released independently before it is merged to GitHub. The uploaded code is the currently checked-out project directory; GitHub merging does not perform the WeChat upload automatically.
- Before any upload, verify the branch name, commit, version number, and clean working tree. A new production change must use a new version number and must not reuse the currently online version.
- After verification and release, push the branch to GitHub and merge it through a pull request. If multiple branches are merged, resolve conflicts while preserving each branch's independent release scope.

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
