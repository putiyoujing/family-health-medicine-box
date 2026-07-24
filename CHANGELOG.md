# Changelog

All notable changes are recorded here. Versions follow the mini-program upload version.

## [1.0.12] - 2026-07-24

### Added

- Complete family health mini-program covering illness timelines, medication and stock, family sharing, reminders, membership redemption, and safe historical AI queries.
- CloudBase functions for login, health data, membership, administration, and reminder dispatch.
- React management console with CloudBase Web Auth, default masking, sensitive-access audit, feedback handling, and redemption-code operations.
- Automated build, lint, configuration, action-coverage, security, and regression gates.

### Security

- Reject anonymous CloudBase sessions before entering the management console.
- Keep administrator authorization and sensitive-field access decisions on the server.
- Prevent browser builds from containing shared admin tokens or server secrets.

### Operations

- Align the package and mini-program upload version at `1.0.12`.
- Establish pull-request CI and document the CloudBase production entry separately from the legacy GitHub Pages demo.

### Known follow-ups

- Verify the deployed 1.0.12 Web admin in a browser without an administrator session; the production build was uploaded on 2026-07-24.
- Rotate the production WeChat AppSecret because it was exposed through an administrative inspection response; no secret value is stored in this repository.
- Add durable evidence artifacts for privacy, two-account isolation, iOS/Android real-device coverage, and real reminder delivery.
- Split the large Web admin bundle and paginate queries that currently cap results at 100.
- Upgrade CloudBase functions from the Node.js 16 runtime.
