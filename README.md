# Wallet Operations Dashboard

A local BNB Chain wallet dashboard for grouped accounts, read-only inspection and dry-run execution planning.

## Features

- Wallets and groups organize local account operations.
- Market and transaction readers enrich inspection views.
- Launch and transaction plans are represented as drafts and dry runs.

## Stack

TypeScript · React · Fastify · ethers · SQLite · Vite · Vitest

SQLite stores local wallet and planning state. Real wallet databases and keys are excluded.

## Getting started

Node.js 24+. Install with npm ci --ignore-scripts. Review tests and configuration before npm test or npm run build. RPC-dependent operations require separate configured services.

## How it works

```text
React interface → Fastify API → local wallet/planning store → read-only RPC readers and draft plans
```

## Current limitations

The original local design stores private keys in SQLite without a vault/unlock layer. This is not a production custody solution. Do not import real funds-bearing keys for review; browser/session and database data are not bundled.

## License

No open-source license has been granted. Redistribution terms remain to be defined.
