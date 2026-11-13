# Changelog

## 2026-11-12

- Added opening ledger deposits when creating goals with an existing saved amount.
- Added client-local reporting dates with validation and six-month withdrawal-category alignment.
- Added shared Supabase Auth client reuse with bounded token caching.
- Escaped transaction search wildcards and rejected implausible transaction dates.
- Added wallet identifier uniqueness migration and conflict responses.
- Moved avatar image normalization and synchronous database work off the async event loop.
- Updated currency, reminder, PWA, and authentication UI copy/layout documentation.

Verification in this workspace: backend **25 passed / 39 skipped**, frontend **189 passed / 8 skipped**, typecheck passed, and production build passed. PostgreSQL integration, live contract, and browser E2E checks were not available.
