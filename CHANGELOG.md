# Changelog

All notable changes are recorded here. Versions follow the mini-program upload version.

## [1.0.13] - 2026-07-24

### Changed

- Remove membership plan cards, prices, checkout, and coupon pages from the mini-program while keeping membership-code redemption and benefit visibility.
- Rename the free-account action from “升级会员” to “兑换会员” and replace external purchase guidance with a channel-neutral, admin-configurable redemption message.
- Stop new feedback submissions from collecting or storing contact details, and align the privacy notice with the reduced feedback payload.
- Refresh the dashboard immediately after the shared login layer succeeds, so a newly authenticated user does not remain on the guest home state.
- Give the three empty-dashboard starter actions distinct visual icons and remove the redundant storage footnote.

### Verification

- Add review-compliance regressions for membership pricing, external guidance, obsolete payment routes, and feedback contact collection.
- Deploy the updated `healthApi`, `paymentApi`, and `adminApi` functions and verify the production membership guide returns the channel-neutral copy.
- Deploy the 1.0.13 Web admin to the existing CloudBase `/admin/` entry and verify the active asset, channel-neutral redemption copy, login page rendering, and browser console.
- Pass the complete project gate with 160 automated tests and 22 static release safeguards.
- Submit the 1.0.13 mini-program for WeChat review on 2026-07-24; review result remains pending.
- Align the package and mini-program upload version at `1.0.13`.

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
