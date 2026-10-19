# Wallet Operations Dashboard

> **Local private review:** publication is paused. See [security review and remaining release conditions](docs/SECURITY_REVIEW.md). Local fixes have not been pushed.


A local BNB Chain wallet dashboard for grouped accounts, read-only inspection and dry-run execution planning.

![review](https://img.shields.io/badge/review-private-374151) ![primary](https://img.shields.io/badge/primary-TypeScript-2563EB) [![LinkedIn](https://img.shields.io/badge/LinkedIn-Douglas%20Silva-0A66C2?logo=linkedin&logoColor=white)](https://www.linkedin.com/in/douglas-silva-data-analyst/)

[Overview](#overview) · [Architecture](#architecture) · [Setup](#setup) · [Validation](#validation) · [Roadmap](#roadmap) · [Review notes](docs/REVIEW.md)

## Overview

- Wallets and groups organize local account operations.
- Market and transaction readers enrich inspection views.
- Launch and transaction plans are represented as drafts and dry runs.

**Technology:** TypeScript · React · Fastify · ethers · SQLite · Vite · Vitest

**Persistence and data:** SQLite stores local wallet and planning state. Real wallet databases and keys are excluded.

## Architecture

```text
React interface → Fastify API → local wallet/planning store → read-only RPC readers and draft plans
```

| Location | Review focus |
| --- | --- |
| [`src/server`](src/server) | Source/configuration inspected for scope and structure |
| [`src/client`](src/client) | Source/configuration inspected for scope and structure |
| [`test/no-broadcast.test.ts`](test/no-broadcast.test.ts) | Source/configuration inspected for scope and structure |
| [`test/simple-keys.test.ts`](test/simple-keys.test.ts) | Source/configuration inspected for scope and structure |
| [`package.json`](package.json) | Source/configuration inspected for scope and structure |

Internal package and module names are retained where changing them would affect imports or compatibility. This descriptive repository name does not imply a completed package/API migration.

## Setup

Node.js 24+. Install with npm ci --ignore-scripts. Review tests and configuration before npm test or npm run build. RPC-dependent operations require separate configured services.

Start from an isolated environment. Use `.env.example` when present and inspect the configuration loader: an example file is not necessarily loaded automatically. Runtime databases, real account sessions and private credentials are not bundled. Live integration prerequisites are separate from local tests.

## Validation

Static parsing checked 0 Python files and 2 strict JSON files. Python syntax errors: 0; JSON errors: 0. No functional test/build result is claimed for this preparation. Separately verified: 30 Vitest tests passed and TypeScript/Vite build passed. RPC calls in those tests use mocks; no real wallet or transaction was used.

Available test scripts are inventoried in [the review notes](docs/REVIEW.md). Choose offline checks before operating any integration.

These results apply to the selected checks on the preparation copy. They do not establish deployment readiness, full coverage, live provider availability or measured performance. CI definitions, when present under `docs/ci-templates/`, are inactive review templates; no remote CI badge is claimed.

## Limits and current status

The original local design stores private keys in SQLite without a vault/unlock layer. This is not a production custody solution. Do not import real funds-bearing keys for review; browser/session and database data are not bundled.

This private snapshot is for code and portfolio review. Generated runtime material and unreviewed binary assets may be excluded. [Review notes](docs/REVIEW.md) record preparation scope, findings and outstanding validation.

## Roadmap

- [ ] Provide a watch-only or synthetic-wallet review mode.
- [ ] Review encrypted storage and local access boundaries before real custody.
- [ ] Validate UI flows separately from mocked RPC unit tests.

## History and attribution

No recoverable original Git history was verified for this snapshot. Import and preparation commits use their actual current dates; filesystem timestamps are not treated as development dates.

No open-source license is granted by this preparation. A license and attribution review is required before public redistribution.

## Maintainer and feedback

Douglas de Oliveira Silva · [GitHub](https://github.com/qquante) · [LinkedIn](https://www.linkedin.com/in/douglas-silva-data-analyst/)

For this private review, report reproducible issues with a minimal fixture and the exact check output. Keep account data, credentials and generated sensitive reports out of issues and commits. Existing contribution guidelines apply where present.

**Topics:** `typescript`, `react`, `fastify`, `sqlite`, `ethereum`, `dashboard`, `dry-run`
