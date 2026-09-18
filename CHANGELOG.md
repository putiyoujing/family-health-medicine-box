# Changelog

All notable changes are recorded here. Versions follow the mini-program upload version.

## [1.0.16] - 2026-09-18

### Changed

- Complete the quick-record background parsing flow for text, medical records, examinations, prescriptions, medicine packages, and instructions.
- Automatically create or reuse recognized medicines in the household medicine cabinet without touching existing user records.
- Show the health-image privacy reminder only once per current illness record, then open the camera or album directly.
- Keep append-record timestamps at the current time and correct the dashboard and illness status-pill layout.

### Verification

- `npm run check` passed with 221 tests and all static release gates.
- `healthApi` was updated in CloudBase environment `family-health-prod-d9csm29f27d75` and verified `Active / Available`.
- No database migration, bulk rewrite, deletion, or production health-data cleanup is included.
- Mini-program experience upload remains a separate release step; formal WeChat production release requires the WeChat review/release workflow.

## [1.0.15] - Unreleased

### Changed

- Reuse the shared family-data cache when returning to the dashboard, illness, medicine, family, and profile pages instead of forcing a full refresh on every page show.
- Keep explicit login, pull-down, mutation, and targeted-action refresh paths so newly changed data still reloads when required.
- Make the medication-record “修改” and “作废” actions compact and right-aligned while preserving their existing behavior.
- Hide the unavailable image-organization entry until the feature is enabled.
- Keep coupons and membership redemption codes as separate admin-managed assets, and preserve the selected admin page during the current browser session.
- Complete the source cleanup for the retired AI-query page and action; this does not enable or deploy a replacement AI workflow.

### Fixed

- Restore persisted medicine attachments when reopening an existing medicine, including normalization between stored `fileId` and the view model's `fileID`.
- Allow a pending family invitation to be shared again with its original invitation code.

### Verification

- Pass the complete project gate with 165 automated tests and 22 static release safeguards.
- No cloud-function deployment, database migration, permission change, or production-data rewrite has been performed while preparing this version.
- The mini-program performance, image, button, and invitation changes do not require a database migration; the admin and cloud-function source changes remain undeployed pending their own production verification.
- Experience upload completed on 2026-09-12; WeChat review and public release remain pending.

## [1.0.14] - 2026-07-27

### Changed

- Remove the AI-query frontend page and its mini-program navigation entry.

### Release

- Release the mini-program to production as `1.0.14`; the official version-management screenshot supplied by the project owner records the release on 2026-07-27.

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
- Record the project owner's confirmation that privacy, two-account isolation, iOS/Android real-device, and real reminder-delivery acceptance passed; raw evidence artifacts remain outside the repository.
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
