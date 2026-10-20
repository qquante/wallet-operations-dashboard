# Wallet Operations Dashboard

![Language: TypeScript](https://img.shields.io/badge/Language-TypeScript-3178C6?style=flat-square&logo=typescript) ![API: Fastify](https://img.shields.io/badge/API-Fastify-555555?style=flat-square) [![License: MIT](https://img.shields.io/badge/License-MIT-555555?style=flat-square)](LICENSE)

A local BNB Chain dashboard for wallet groups, account inspection, launch drafts and transaction planning.

React presents the account/group workflow; Fastify owns API operations; SQLite stores local state. The execution planner prepares per-wallet approval/trade requirements and gas/balance estimates without treating a draft as a signed transaction.

## What a plan contains

[fourMemeExecutionPlanner.ts](src/server/fourMemeExecutionPlanner.ts) produces rows with nonce allocation, approval calldata, trade dry-run details, gas requirements and wallet balances. Row status distinguishes `ready_dry_run`, `insufficient_bnb`, `simulation_error` and `gas_unknown`.

Its plan contract explicitly includes:

```typescript
readOnly: true
broadcast: false
blockedForBroadcast: true
blockReason: 'explicit_real_mode_not_enabled'
```

This is a contract excerpt, not an API response from a live wallet. Other server modules still need their own operational review; the planner's flags should not be generalized to every account action.

## Build and test the local application

Requires Node.js 24+:

```console
npm ci --ignore-scripts
npm test
npm run build
```

The [test directory](test) includes wallet/group, transaction-parser, plan-storage and no-broadcast regressions. These are declared checks; this documentation does not claim a newly validated end-to-end wallet session.

## Read the boundaries before adding accounts

- [src/client/main.tsx](src/client/main.tsx): interface and account workflows.
- [src/server/app.ts](src/server/app.ts): API boundary.
- [src/server/db.ts](src/server/db.ts): local database.
- [src/server/executionPlanStore.ts](src/server/executionPlanStore.ts): persisted plans.
- [src/server/txParser.ts](src/server/txParser.ts): transaction interpretation.

The original design stores private keys in SQLite without a vault/unlock layer. Use synthetic data for source inspection; this snapshot is not a production custody solution. Local databases, imported account material and real keys must stay outside the repository. No wallet was connected, signed or broadcast for this documentation.

**Technology:** TypeScript · React · Fastify · ethers · SQLite · Vite · Vitest

Project-authored source: [MIT](LICENSE). Third-party components retain their own notices and terms.
