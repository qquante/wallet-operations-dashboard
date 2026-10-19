import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { formatEther } from 'ethers';
import { nowIso } from './time.js';
import type {
  AppSettingRecord,
  AuditEvent,
  BnbPriceSnapshotRecord,
  BlueprintRecord,
  ExecutionPlanConfirmationRecord,
  ExecutionPlanRecord,
  GroupRecord,
  LaunchDraftRecord,
  PositionFillRecord,
  PositionLotRecord,
  PositionSummaryRecord,
  TerminalAutomationRecord,
  TerminalCampaignRecord,
  TerminalTaskRecord,
  TerminalTokenRecord,
  TokenPriceSnapshotRecord,
  WalletHistoryRecord,
  WalletRecord,
  WalletTokenPositionRecord
} from './types.js';

function parseTags(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function walletFromRow(row: Record<string, unknown>): WalletRecord {
  return {
    id: String(row.id),
    address: String(row.address),
    label: String(row.label ?? ''),
    tags: parseTags(row.tags as string | null),
    source: row.source as WalletRecord['source'],
    status: row.status as WalletRecord['status'],
    balanceWei: String(row.balance_wei ?? '0'),
    balanceBNB: String(row.balance_bnb ?? '0'),
    primeRank: row.prime_rank === null || row.prime_rank === undefined ? null : Number(row.prime_rank),
    devRank: row.dev_rank === null || row.dev_rank === undefined ? null : Number(row.dev_rank),
    devRole: row.dev_role ? String(row.dev_role) : null,
    devNotes: row.dev_notes ? String(row.dev_notes) : null,
    useCount: Number(row.use_count ?? 0),
    lastUsedAt: row.last_used_at ? String(row.last_used_at) : null,
    activeGroupId: row.active_group_id ? String(row.active_group_id) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function groupFromRow(row: Record<string, unknown>): GroupRecord {
  const totalWei = String(row.total_balance_wei ?? '0');
  return {
    id: String(row.id),
    name: String(row.name),
    campaignName: row.campaign_name ? String(row.campaign_name) : null,
    tokenAddress: row.token_address ? String(row.token_address) : null,
    fourMemeTokenId: row.four_meme_token_id ? String(row.four_meme_token_id) : null,
    fourMemeStatus: row.four_meme_status ? String(row.four_meme_status) : null,
    tags: parseTags(row.tags as string | null),
    status: row.status as GroupRecord['status'],
    walletCount: Number(row.wallet_count ?? 0),
    totalBalanceWei: totalWei,
    totalBalanceBNB: formatEther(BigInt(totalWei)),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function parseMetadata(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function executionPlanFromRow(row: Record<string, unknown>): ExecutionPlanRecord {
  return {
    id: String(row.id),
    version: String(row.version),
    planHash: String(row.plan_hash),
    tokenAddress: String(row.token_address),
    side: row.side as ExecutionPlanRecord['side'],
    status: row.status as ExecutionPlanRecord['status'],
    request: parseMetadata(row.request_json as string | null),
    plan: parseMetadata(row.plan_json as string | null),
    latestReview: parseMetadata(row.latest_review_json as string | null),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function executionPlanConfirmationFromRow(row: Record<string, unknown>): ExecutionPlanConfirmationRecord {
  return {
    id: String(row.id),
    planId: String(row.plan_id),
    status: row.status as ExecutionPlanConfirmationRecord['status'],
    requiredPhrase: String(row.required_phrase),
    phraseAccepted: Boolean(row.phrase_accepted),
    operatorNote: row.operator_note ? String(row.operator_note) : null,
    checks: parseMetadata(row.checks_json as string | null),
    createdAt: String(row.created_at)
  };
}

function parseJsonArray(value: string | null): Array<Record<string, unknown>> {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === 'object' && !Array.isArray(item)) as Array<Record<string, unknown>> : [];
  } catch {
    return [];
  }
}

function walletHistoryFromRow(row: Record<string, unknown>): WalletHistoryRecord {
  return {
    id: String(row.id),
    walletId: String(row.wallet_id),
    walletAddress: String(row.wallet_address ?? ''),
    walletLabel: String(row.wallet_label ?? ''),
    type: String(row.type),
    groupId: row.group_id ? String(row.group_id) : null,
    groupName: row.group_name ? String(row.group_name) : null,
    tokenAddress: row.token_address ? String(row.token_address) : null,
    tokenSymbol: row.token_symbol ? String(row.token_symbol) : null,
    campaignName: row.campaign_name ? String(row.campaign_name) : null,
    amountWei: row.amount_wei ? String(row.amount_wei) : null,
    amountBNB: row.amount_bnb ? String(row.amount_bnb) : null,
    status: String(row.status ?? 'recorded'),
    notes: row.notes ? String(row.notes) : null,
    metadata: parseMetadata(row.metadata as string | null),
    createdAt: String(row.created_at)
  };
}

function launchDraftFromRow(row: Record<string, unknown>): LaunchDraftRecord {
  return {
    id: String(row.id),
    campaignName: row.campaign_name ? String(row.campaign_name) : null,
    groupIds: parseTags(row.group_ids as string | null),
    devWalletId: row.dev_wallet_id ? String(row.dev_wallet_id) : null,
    devWalletLabel: row.dev_wallet_label ? String(row.dev_wallet_label) : null,
    devWalletAddress: row.dev_wallet_address ? String(row.dev_wallet_address) : null,
    tokenAddress: row.token_address ? String(row.token_address) : null,
    name: String(row.name),
    shortName: String(row.short_name),
    description: String(row.description),
    imgUrl: String(row.img_url ?? ''),
    imageFilePath: row.image_file_path ? String(row.image_file_path) : null,
    label: String(row.label ?? 'Meme'),
    webUrl: String(row.web_url ?? ''),
    twitterUrl: String(row.twitter_url ?? ''),
    telegramUrl: String(row.telegram_url ?? ''),
    raisedSymbol: String(row.raised_symbol ?? ''),
    raisedTokenAddress: String(row.raised_token_address ?? ''),
    raisedTokenSnapshot: parseMetadata(row.raised_token_snapshot as string | null),
    preSale: String(row.pre_sale ?? '0'),
    onlyMPC: Boolean(Number(row.only_mpc ?? 0)),
    feePlan: Boolean(Number(row.fee_plan ?? 1)),
    status: String(row.status ?? 'draft'),
    controls: parseMetadata(row.controls as string | null),
    triggers: parseJsonArray(row.triggers as string | null),
    createBodyPreview: parseMetadata(row.create_body_preview as string | null),
    createDryRunPlan: parseMetadata(row.create_dry_run_plan as string | null),
    note: row.note ? String(row.note) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function tokenPositionFromRow(row: Record<string, unknown>): WalletTokenPositionRecord {
  return {
    walletId: String(row.wallet_id),
    walletAddress: String(row.wallet_address ?? ''),
    walletLabel: String(row.wallet_label ?? ''),
    groupId: row.group_id ? String(row.group_id) : null,
    groupName: row.group_name ? String(row.group_name) : null,
    campaignName: row.campaign_name ? String(row.campaign_name) : null,
    tokenAddress: String(row.token_address),
    tokenSymbol: String(row.token_symbol),
    tokenDecimals: Number(row.token_decimals ?? 18),
    tokenBalanceRaw: String(row.token_balance_raw ?? '0'),
    tokenBalance: String(row.token_balance ?? '0'),
    tokenUsdValue: row.token_usd_value === null || row.token_usd_value === undefined ? null : Number(row.token_usd_value),
    plannedCostUsd: row.planned_cost_usd === null || row.planned_cost_usd === undefined ? null : Number(row.planned_cost_usd),
    pnlUsd: row.pnl_usd === null || row.pnl_usd === undefined ? null : Number(row.pnl_usd),
    firstSeenAt: String(row.first_seen_at),
    updatedAt: String(row.updated_at)
  };
}

function terminalCampaignFromRow(row: Record<string, unknown>): TerminalCampaignRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    status: row.status as TerminalCampaignRecord['status'],
    groupIds: parseTags(row.group_ids as string | null),
    devWalletIds: parseTags(row.dev_wallet_ids as string | null),
    tags: parseTags(row.tags as string | null),
    metadata: parseMetadata(row.metadata as string | null),
    tokenCount: Number(row.token_count ?? 0),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function terminalTokenFromRow(row: Record<string, unknown>): TerminalTokenRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    symbol: String(row.symbol),
    tokenAddress: row.token_address ? String(row.token_address) : null,
    launchpad: String(row.launchpad ?? 'four_meme'),
    chainId: Number(row.chain_id ?? 56),
    status: row.status as TerminalTokenRecord['status'],
    campaignId: row.campaign_id ? String(row.campaign_id) : null,
    campaignName: row.campaign_name ? String(row.campaign_name) : null,
    groupId: row.group_id ? String(row.group_id) : null,
    groupName: row.group_name ? String(row.group_name) : null,
    devWalletId: row.dev_wallet_id ? String(row.dev_wallet_id) : null,
    devWalletLabel: row.dev_wallet_label ? String(row.dev_wallet_label) : null,
    devWalletAddress: row.dev_wallet_address ? String(row.dev_wallet_address) : null,
    launchDraftId: row.launch_draft_id ? String(row.launch_draft_id) : null,
    imageUrl: row.image_url ? String(row.image_url) : null,
    marketCapUsd: row.market_cap_usd === null || row.market_cap_usd === undefined ? null : Number(row.market_cap_usd),
    tokenPriceUsd: row.token_price_usd === null || row.token_price_usd === undefined ? null : Number(row.token_price_usd),
    totalHoldings: row.total_holdings ? String(row.total_holdings) : null,
    totalInvestedUsd: row.total_invested_usd === null || row.total_invested_usd === undefined ? null : Number(row.total_invested_usd),
    totalSoldUsd: row.total_sold_usd === null || row.total_sold_usd === undefined ? null : Number(row.total_sold_usd),
    realizedPnlUsd: row.realized_pnl_usd === null || row.realized_pnl_usd === undefined ? null : Number(row.realized_pnl_usd),
    tags: parseTags(row.tags as string | null),
    metadata: parseMetadata(row.metadata as string | null),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function terminalTaskFromRow(row: Record<string, unknown>): TerminalTaskRecord {
  return {
    id: String(row.id),
    tokenId: row.token_id ? String(row.token_id) : null,
    tokenName: row.token_name ? String(row.token_name) : null,
    tokenSymbol: row.token_symbol ? String(row.token_symbol) : null,
    name: String(row.name),
    kind: row.kind as TerminalTaskRecord['kind'],
    status: row.status as TerminalTaskRecord['status'],
    triggerType: row.trigger_type as TerminalTaskRecord['triggerType'],
    triggerValue: row.trigger_value ? String(row.trigger_value) : null,
    walletIds: parseTags(row.wallet_ids as string | null),
    groupId: row.group_id ? String(row.group_id) : null,
    groupName: row.group_name ? String(row.group_name) : null,
    params: parseMetadata(row.params as string | null),
    dryRunPlan: parseMetadata(row.dry_run_plan as string | null),
    lastError: row.last_error ? String(row.last_error) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function terminalAutomationFromRow(row: Record<string, unknown>): TerminalAutomationRecord {
  return {
    id: String(row.id),
    tokenId: row.token_id ? String(row.token_id) : null,
    tokenName: row.token_name ? String(row.token_name) : null,
    tokenSymbol: row.token_symbol ? String(row.token_symbol) : null,
    name: String(row.name),
    status: row.status as TerminalAutomationRecord['status'],
    triggerType: row.trigger_type as TerminalAutomationRecord['triggerType'],
    triggerValue: row.trigger_value ? String(row.trigger_value) : null,
    taskIds: parseTags(row.task_ids as string | null),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function blueprintFromRow(row: Record<string, unknown>): BlueprintRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    description: row.description ? String(row.description) : null,
    walletSlots: parseJsonArray(row.wallet_slots as string | null),
    taskTemplates: parseJsonArray(row.task_templates as string | null),
    settings: parseMetadata(row.settings as string | null),
    status: row.status as BlueprintRecord['status'],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function tokenPriceSnapshotFromRow(row: Record<string, unknown>): TokenPriceSnapshotRecord {
  return {
    id: String(row.id),
    tokenAddress: String(row.token_address),
    priceUsd: row.price_usd === null || row.price_usd === undefined ? null : Number(row.price_usd),
    source: String(row.source),
    marketCapUsd: row.market_cap_usd === null || row.market_cap_usd === undefined ? null : Number(row.market_cap_usd),
    progress: row.progress === null || row.progress === undefined ? null : Number(row.progress),
    fourMemeStatus: row.four_meme_status ? String(row.four_meme_status) : null,
    liquidityUsd: row.liquidity_usd === null || row.liquidity_usd === undefined ? null : Number(row.liquidity_usd),
    volume24hUsd: row.volume_24h_usd === null || row.volume_24h_usd === undefined ? null : Number(row.volume_24h_usd),
    metadata: parseMetadata(row.metadata as string | null),
    createdAt: String(row.created_at)
  };
}

function bnbPriceSnapshotFromRow(row: Record<string, unknown>): BnbPriceSnapshotRecord {
  return {
    id: String(row.id),
    symbol: 'BNBUSDT',
    priceUsd: Number(row.price_usd),
    source: String(row.source),
    interval: String(row.interval),
    openTimeMs: Number(row.open_time_ms),
    closeTimeMs: Number(row.close_time_ms),
    openUsd: Number(row.open_usd),
    highUsd: Number(row.high_usd),
    lowUsd: Number(row.low_usd),
    closeUsd: Number(row.close_usd),
    volume: row.volume ? String(row.volume) : null,
    metadata: parseMetadata(row.metadata as string | null),
    createdAt: String(row.created_at)
  };
}

function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function positionFillFromRow(row: Record<string, unknown>): PositionFillRecord {
  return {
    id: String(row.id),
    walletId: String(row.wallet_id),
    walletAddress: String(row.wallet_address ?? ''),
    walletLabel: String(row.wallet_label ?? ''),
    tokenId: row.token_id ? String(row.token_id) : null,
    tokenName: row.token_name ? String(row.token_name) : null,
    tokenAddress: String(row.token_address),
    tokenSymbol: String(row.token_symbol),
    side: row.side as PositionFillRecord['side'],
    status: row.status as PositionFillRecord['status'],
    source: row.source as PositionFillRecord['source'],
    quantityRaw: row.quantity_raw ? String(row.quantity_raw) : null,
    quantityTokens: row.quantity_tokens ? String(row.quantity_tokens) : null,
    tokenDecimals: Number(row.token_decimals ?? 18),
    priceUsd: nullableNumber(row.price_usd),
    valueUsd: nullableNumber(row.value_usd),
    costBasisUsd: nullableNumber(row.cost_basis_usd),
    realizedPnlUsd: nullableNumber(row.realized_pnl_usd),
    bnbAmountWei: row.bnb_amount_wei ? String(row.bnb_amount_wei) : null,
    bnbAmount: row.bnb_amount ? String(row.bnb_amount) : null,
    bnbPriceUsd: nullableNumber(row.bnb_price_usd),
    txHash: row.tx_hash ? String(row.tx_hash) : null,
    groupId: row.group_id ? String(row.group_id) : null,
    groupName: row.group_name ? String(row.group_name) : null,
    campaignName: row.campaign_name ? String(row.campaign_name) : null,
    launchDraftId: row.launch_draft_id ? String(row.launch_draft_id) : null,
    taskId: row.task_id ? String(row.task_id) : null,
    notes: row.notes ? String(row.notes) : null,
    metadata: parseMetadata(row.metadata as string | null),
    createdAt: String(row.created_at)
  };
}

function positionLotFromRow(row: Record<string, unknown>): PositionLotRecord {
  return {
    id: String(row.id),
    walletId: String(row.wallet_id),
    walletAddress: String(row.wallet_address ?? ''),
    walletLabel: String(row.wallet_label ?? ''),
    tokenId: row.token_id ? String(row.token_id) : null,
    tokenAddress: String(row.token_address),
    tokenSymbol: String(row.token_symbol),
    status: row.status as PositionLotRecord['status'],
    sourceFillId: String(row.source_fill_id),
    openedQuantityTokens: String(row.opened_quantity_tokens),
    openQuantityTokens: String(row.open_quantity_tokens),
    costBasisUsd: Number(row.cost_basis_usd ?? 0),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

export class BuneDb {
  readonly db: DatabaseSync;

  constructor(dbPath = process.env.BUNE_DB_PATH ?? path.join(process.cwd(), 'data', 'bune.sqlite')) {
    mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.migrate();
  }

  close(): void {
    this.db.close();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS vault_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS wallets (
        id TEXT PRIMARY KEY,
        address TEXT NOT NULL UNIQUE,
        private_key TEXT,
        label TEXT NOT NULL DEFAULT '',
        tags TEXT NOT NULL DEFAULT '[]',
        source TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'available',
        balance_wei TEXT NOT NULL DEFAULT '0',
        balance_bnb TEXT NOT NULL DEFAULT '0',
        prime_rank INTEGER,
        dev_rank INTEGER,
        dev_role TEXT,
        dev_notes TEXT,
        use_count INTEGER NOT NULL DEFAULT 0,
        last_used_at TEXT,
        active_group_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        vault_salt TEXT,
        vault_iv TEXT,
        vault_auth_tag TEXT,
        vault_ciphertext TEXT
      );

      CREATE TABLE IF NOT EXISTS groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        campaign_name TEXT,
        token_address TEXT,
        four_meme_token_id TEXT,
        four_meme_status TEXT,
        tags TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS group_wallets (
        group_id TEXT NOT NULL,
        wallet_id TEXT NOT NULL,
        reserved_at TEXT NOT NULL,
        released_at TEXT,
        PRIMARY KEY (group_id, wallet_id, reserved_at),
        FOREIGN KEY(group_id) REFERENCES groups(id),
        FOREIGN KEY(wallet_id) REFERENCES wallets(id)
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_group_wallets_active_wallet
      ON group_wallets(wallet_id)
      WHERE released_at IS NULL;

      CREATE TABLE IF NOT EXISTS wallet_history (
        id TEXT PRIMARY KEY,
        wallet_id TEXT NOT NULL,
        type TEXT NOT NULL,
        group_id TEXT,
        token_address TEXT,
        token_symbol TEXT,
        campaign_name TEXT,
        amount_wei TEXT,
        amount_bnb TEXT,
        status TEXT NOT NULL DEFAULT 'recorded',
        notes TEXT,
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        FOREIGN KEY(wallet_id) REFERENCES wallets(id),
        FOREIGN KEY(group_id) REFERENCES groups(id)
      );

      CREATE INDEX IF NOT EXISTS idx_wallet_history_wallet_created
      ON wallet_history(wallet_id, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_wallet_history_token
      ON wallet_history(token_address, created_at DESC);

      CREATE TABLE IF NOT EXISTS wallet_token_positions (
        wallet_id TEXT NOT NULL,
        token_address TEXT NOT NULL,
        group_id TEXT,
        campaign_name TEXT,
        token_symbol TEXT NOT NULL,
        token_decimals INTEGER NOT NULL DEFAULT 18,
        token_balance_raw TEXT NOT NULL DEFAULT '0',
        token_balance TEXT NOT NULL DEFAULT '0',
        token_usd_value REAL,
        planned_cost_usd REAL,
        pnl_usd REAL,
        first_seen_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(wallet_id, token_address),
        FOREIGN KEY(wallet_id) REFERENCES wallets(id),
        FOREIGN KEY(group_id) REFERENCES groups(id)
      );

      CREATE TABLE IF NOT EXISTS launch_drafts (
        id TEXT PRIMARY KEY,
        campaign_name TEXT,
        group_ids TEXT NOT NULL DEFAULT '[]',
        dev_wallet_id TEXT,
        token_address TEXT,
        name TEXT NOT NULL,
        short_name TEXT NOT NULL,
        description TEXT NOT NULL,
        img_url TEXT NOT NULL DEFAULT '',
        image_file_path TEXT,
        label TEXT NOT NULL DEFAULT 'Meme',
        web_url TEXT NOT NULL DEFAULT '',
        twitter_url TEXT NOT NULL DEFAULT '',
        telegram_url TEXT NOT NULL DEFAULT '',
        raised_symbol TEXT NOT NULL,
        raised_token_address TEXT NOT NULL DEFAULT '',
        raised_token_snapshot TEXT NOT NULL DEFAULT '{}',
        pre_sale TEXT NOT NULL DEFAULT '0',
        only_mpc INTEGER NOT NULL DEFAULT 0,
        fee_plan INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'draft',
        controls TEXT NOT NULL DEFAULT '{}',
        triggers TEXT NOT NULL DEFAULT '[]',
        create_body_preview TEXT NOT NULL DEFAULT '{}',
        create_dry_run_plan TEXT NOT NULL DEFAULT '{}',
        note TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(dev_wallet_id) REFERENCES wallets(id)
      );

      CREATE INDEX IF NOT EXISTS idx_launch_drafts_created
      ON launch_drafts(created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_launch_drafts_campaign
      ON launch_drafts(campaign_name, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_launch_drafts_status
      ON launch_drafts(status, created_at DESC);

      CREATE TABLE IF NOT EXISTS terminal_campaigns (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        group_ids TEXT NOT NULL DEFAULT '[]',
        dev_wallet_ids TEXT NOT NULL DEFAULT '[]',
        tags TEXT NOT NULL DEFAULT '[]',
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_terminal_campaigns_status
      ON terminal_campaigns(status, created_at DESC);

      CREATE TABLE IF NOT EXISTS terminal_tokens (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        symbol TEXT NOT NULL,
        token_address TEXT,
        launchpad TEXT NOT NULL DEFAULT 'four_meme',
        chain_id INTEGER NOT NULL DEFAULT 56,
        status TEXT NOT NULL DEFAULT 'draft',
        campaign_id TEXT,
        campaign_name TEXT,
        group_id TEXT,
        dev_wallet_id TEXT,
        launch_draft_id TEXT,
        image_url TEXT,
        market_cap_usd REAL,
        token_price_usd REAL,
        total_holdings TEXT,
        total_invested_usd REAL,
        total_sold_usd REAL,
        realized_pnl_usd REAL,
        tags TEXT NOT NULL DEFAULT '[]',
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(campaign_id) REFERENCES terminal_campaigns(id),
        FOREIGN KEY(group_id) REFERENCES groups(id),
        FOREIGN KEY(dev_wallet_id) REFERENCES wallets(id),
        FOREIGN KEY(launch_draft_id) REFERENCES launch_drafts(id)
      );

      CREATE INDEX IF NOT EXISTS idx_terminal_tokens_status
      ON terminal_tokens(status, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_terminal_tokens_campaign
      ON terminal_tokens(campaign_id, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_terminal_tokens_address
      ON terminal_tokens(token_address);

      CREATE TABLE IF NOT EXISTS terminal_tasks (
        id TEXT PRIMARY KEY,
        token_id TEXT,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued',
        trigger_type TEXT NOT NULL DEFAULT 'manual',
        trigger_value TEXT,
        wallet_ids TEXT NOT NULL DEFAULT '[]',
        group_id TEXT,
        params TEXT NOT NULL DEFAULT '{}',
        dry_run_plan TEXT NOT NULL DEFAULT '{}',
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(token_id) REFERENCES terminal_tokens(id),
        FOREIGN KEY(group_id) REFERENCES groups(id)
      );

      CREATE INDEX IF NOT EXISTS idx_terminal_tasks_status
      ON terminal_tasks(status, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_terminal_tasks_token
      ON terminal_tasks(token_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS terminal_automations (
        id TEXT PRIMARY KEY,
        token_id TEXT,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        trigger_type TEXT NOT NULL,
        trigger_value TEXT,
        task_ids TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(token_id) REFERENCES terminal_tokens(id)
      );

      CREATE INDEX IF NOT EXISTS idx_terminal_automations_status
      ON terminal_automations(status, created_at DESC);

      CREATE TABLE IF NOT EXISTS blueprints (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        wallet_slots TEXT NOT NULL DEFAULT '[]',
        task_templates TEXT NOT NULL DEFAULT '[]',
        settings TEXT NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_blueprints_status
      ON blueprints(status, created_at DESC);

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS token_price_snapshots (
        id TEXT PRIMARY KEY,
        token_address TEXT NOT NULL,
        price_usd REAL,
        source TEXT NOT NULL,
        market_cap_usd REAL,
        progress REAL,
        four_meme_status TEXT,
        liquidity_usd REAL,
        volume_24h_usd REAL,
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_token_price_snapshots_token_created
      ON token_price_snapshots(token_address, created_at DESC);

      CREATE TABLE IF NOT EXISTS bnb_price_snapshots (
        id TEXT PRIMARY KEY,
        symbol TEXT NOT NULL,
        price_usd REAL NOT NULL,
        source TEXT NOT NULL,
        interval TEXT NOT NULL,
        open_time_ms INTEGER NOT NULL,
        close_time_ms INTEGER NOT NULL,
        open_usd REAL NOT NULL,
        high_usd REAL NOT NULL,
        low_usd REAL NOT NULL,
        close_usd REAL NOT NULL,
        volume TEXT,
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_bnb_price_snapshots_unique
      ON bnb_price_snapshots(symbol, interval, open_time_ms, source);

      CREATE INDEX IF NOT EXISTS idx_bnb_price_snapshots_lookup
      ON bnb_price_snapshots(symbol, interval, open_time_ms DESC, close_time_ms DESC);

      CREATE TABLE IF NOT EXISTS position_fills (
        id TEXT PRIMARY KEY,
        wallet_id TEXT NOT NULL,
        token_id TEXT,
        token_address TEXT NOT NULL,
        token_symbol TEXT NOT NULL,
        side TEXT NOT NULL,
        status TEXT NOT NULL,
        source TEXT NOT NULL,
        quantity_raw TEXT,
        quantity_tokens TEXT,
        token_decimals INTEGER NOT NULL DEFAULT 18,
        price_usd REAL,
        value_usd REAL,
        cost_basis_usd REAL,
        realized_pnl_usd REAL,
        bnb_amount_wei TEXT,
        bnb_amount TEXT,
        bnb_price_usd REAL,
        tx_hash TEXT,
        group_id TEXT,
        campaign_name TEXT,
        launch_draft_id TEXT,
        task_id TEXT,
        notes TEXT,
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        FOREIGN KEY(wallet_id) REFERENCES wallets(id),
        FOREIGN KEY(token_id) REFERENCES terminal_tokens(id),
        FOREIGN KEY(group_id) REFERENCES groups(id),
        FOREIGN KEY(launch_draft_id) REFERENCES launch_drafts(id),
        FOREIGN KEY(task_id) REFERENCES terminal_tasks(id)
      );

      CREATE INDEX IF NOT EXISTS idx_position_fills_wallet_token_created
      ON position_fills(wallet_id, token_address, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_position_fills_token_created
      ON position_fills(token_address, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_position_fills_group_created
      ON position_fills(group_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS position_lots (
        id TEXT PRIMARY KEY,
        wallet_id TEXT NOT NULL,
        token_id TEXT,
        token_address TEXT NOT NULL,
        token_symbol TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        source_fill_id TEXT NOT NULL,
        opened_quantity_tokens TEXT NOT NULL,
        open_quantity_tokens TEXT NOT NULL,
        cost_basis_usd REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(wallet_id) REFERENCES wallets(id),
        FOREIGN KEY(token_id) REFERENCES terminal_tokens(id),
        FOREIGN KEY(source_fill_id) REFERENCES position_fills(id)
      );

      CREATE INDEX IF NOT EXISTS idx_position_lots_wallet_token_status
      ON position_lots(wallet_id, token_address, status, created_at ASC);

      CREATE TABLE IF NOT EXISTS execution_plans (
        id TEXT PRIMARY KEY,
        version TEXT NOT NULL,
        plan_hash TEXT NOT NULL,
        token_address TEXT NOT NULL,
        side TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'saved',
        request_json TEXT NOT NULL DEFAULT '{}',
        plan_json TEXT NOT NULL DEFAULT '{}',
        latest_review_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_execution_plans_token_created
      ON execution_plans(token_address, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_execution_plans_status_created
      ON execution_plans(status, created_at DESC);

      CREATE TABLE IF NOT EXISTS execution_plan_confirmations (
        id TEXT PRIMARY KEY,
        plan_id TEXT NOT NULL,
        status TEXT NOT NULL,
        required_phrase TEXT NOT NULL,
        phrase_accepted INTEGER NOT NULL DEFAULT 0,
        operator_note TEXT,
        checks_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        FOREIGN KEY(plan_id) REFERENCES execution_plans(id)
      );

      CREATE INDEX IF NOT EXISTS idx_execution_plan_confirmations_plan_created
      ON execution_plan_confirmations(plan_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        severity TEXT NOT NULL,
        message TEXT NOT NULL,
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );
    `);
    try {
      this.db.exec('ALTER TABLE wallets ADD COLUMN private_key TEXT;');
    } catch {
      // Existing databases already have this column.
    }
    try {
      this.db.exec('ALTER TABLE wallets ADD COLUMN prime_rank INTEGER;');
    } catch {
      // Existing databases already have this column.
    }
    try {
      this.db.exec('ALTER TABLE wallets ADD COLUMN dev_rank INTEGER;');
    } catch {
      // Existing databases already have this column.
    }
    try {
      this.db.exec('ALTER TABLE wallets ADD COLUMN dev_role TEXT;');
    } catch {
      // Existing databases already have this column.
    }
    try {
      this.db.exec('ALTER TABLE wallets ADD COLUMN dev_notes TEXT;');
    } catch {
      // Existing databases already have this column.
    }
    try {
      this.db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_wallets_dev_rank
        ON wallets(dev_rank)
        WHERE dev_rank IS NOT NULL;
      `);
    } catch {
      // Existing databases may still be mid-migration if SQLite rejects stale metadata.
    }
  }

  getMeta(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM vault_meta WHERE key = ?').get(key) as { value?: string } | undefined;
    return row?.value ?? null;
  }

  setMeta(key: string, value: string): void {
    this.db.prepare(`
      INSERT INTO vault_meta (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, value);
  }

  insertEvent(event: AuditEvent): void {
    this.db.prepare(`
      INSERT INTO events (id, type, severity, message, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(event.id, event.type, event.severity, event.message, JSON.stringify(event.metadata), event.createdAt);
  }

  listEvents(limit = 100): AuditEvent[] {
    const rows = this.db.prepare(`
      SELECT * FROM events ORDER BY created_at DESC LIMIT ?
    `).all(limit) as Record<string, unknown>[];
    return rows.map((row) => ({
      id: String(row.id),
      type: String(row.type),
      severity: row.severity as AuditEvent['severity'],
      message: String(row.message),
      metadata: JSON.parse(String(row.metadata ?? '{}')) as Record<string, unknown>,
      createdAt: String(row.created_at)
    }));
  }

  insertExecutionPlan(input: {
    version: string;
    planHash: string;
    tokenAddress: string;
    side: ExecutionPlanRecord['side'];
    request: Record<string, unknown>;
    plan: Record<string, unknown>;
  }): ExecutionPlanRecord {
    const id = `exec_${randomUUID()}`;
    const time = nowIso();
    this.db.prepare(`
      INSERT INTO execution_plans (
        id, version, plan_hash, token_address, side, status,
        request_json, plan_json, latest_review_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'saved', ?, ?, '{}', ?, ?)
    `).run(
      id,
      input.version,
      input.planHash,
      input.tokenAddress,
      input.side,
      JSON.stringify(input.request),
      JSON.stringify(input.plan),
      time,
      time
    );
    const created = this.executionPlanById(id);
    if (!created) throw new Error('execution_plan_create_failed');
    return created;
  }

  executionPlanById(id: string): ExecutionPlanRecord | null {
    const row = this.db.prepare('SELECT * FROM execution_plans WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? executionPlanFromRow(row) : null;
  }

  listExecutionPlans(filters: { tokenAddress?: string; status?: string; limit?: number } = {}): ExecutionPlanRecord[] {
    const clauses: string[] = [];
    const params: SQLInputValue[] = [];
    if (filters.tokenAddress) {
      clauses.push('lower(token_address) = lower(?)');
      params.push(filters.tokenAddress);
    }
    if (filters.status) {
      clauses.push('status = ?');
      params.push(filters.status);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    params.push(Math.min(Math.max(filters.limit ?? 50, 1), 200));
    const rows = this.db.prepare(`
      SELECT * FROM execution_plans
      ${where}
      ORDER BY created_at DESC
      LIMIT ?
    `).all(...params) as Record<string, unknown>[];
    return rows.map(executionPlanFromRow);
  }

  updateExecutionPlanReview(id: string, review: Record<string, unknown>): ExecutionPlanRecord {
    this.db.prepare(`
      UPDATE execution_plans
      SET status = CASE WHEN status = 'archived' THEN status ELSE 'reviewed' END,
          latest_review_json = ?,
          updated_at = ?
      WHERE id = ?
    `).run(JSON.stringify(review), nowIso(), id);
    const updated = this.executionPlanById(id);
    if (!updated) throw new Error('execution_plan_not_found');
    return updated;
  }

  archiveExecutionPlan(id: string): ExecutionPlanRecord {
    this.db.prepare('UPDATE execution_plans SET status = ?, updated_at = ? WHERE id = ?').run('archived', nowIso(), id);
    const updated = this.executionPlanById(id);
    if (!updated) throw new Error('execution_plan_not_found');
    return updated;
  }

  insertExecutionPlanConfirmation(input: {
    planId: string;
    status: ExecutionPlanConfirmationRecord['status'];
    requiredPhrase: string;
    phraseAccepted: boolean;
    operatorNote?: string | null;
    checks: Record<string, unknown>;
  }): ExecutionPlanConfirmationRecord {
    const id = `exec_conf_${randomUUID()}`;
    const createdAt = nowIso();
    this.db.prepare(`
      INSERT INTO execution_plan_confirmations (
        id, plan_id, status, required_phrase, phrase_accepted, operator_note, checks_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.planId,
      input.status,
      input.requiredPhrase,
      input.phraseAccepted ? 1 : 0,
      input.operatorNote ?? null,
      JSON.stringify(input.checks),
      createdAt
    );
    const row = this.db.prepare('SELECT * FROM execution_plan_confirmations WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!row) throw new Error('execution_plan_confirmation_create_failed');
    return executionPlanConfirmationFromRow(row);
  }

  listExecutionPlanConfirmations(planId: string, limit = 20): ExecutionPlanConfirmationRecord[] {
    const rows = this.db.prepare(`
      SELECT * FROM execution_plan_confirmations
      WHERE plan_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(planId, Math.min(Math.max(limit, 1), 100)) as Record<string, unknown>[];
    return rows.map(executionPlanConfirmationFromRow);
  }

  walletByAddress(address: string): WalletRecord | null {
    const row = this.db.prepare('SELECT * FROM wallets WHERE lower(address) = lower(?)').get(address) as Record<string, unknown> | undefined;
    return row ? walletFromRow(row) : null;
  }

  walletById(id: string): WalletRecord | null {
    const row = this.db.prepare('SELECT * FROM wallets WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? walletFromRow(row) : null;
  }

  walletKeyRows(walletIds?: string[]): Record<string, unknown>[] {
    if (walletIds?.length) {
      const placeholders = walletIds.map(() => '?').join(',');
      return this.db.prepare(`SELECT * FROM wallets WHERE id IN (${placeholders}) ORDER BY created_at ASC`).all(...walletIds) as Record<string, unknown>[];
    }
    return this.db.prepare('SELECT * FROM wallets ORDER BY created_at ASC').all() as Record<string, unknown>[];
  }

  legacyEncryptedWalletCount(): number {
    const row = this.db.prepare(`
      SELECT COUNT(*) AS count FROM wallets
      WHERE (private_key IS NULL OR private_key = '')
        AND vault_ciphertext IS NOT NULL
    `).get() as { count?: number } | undefined;
    return Number(row?.count ?? 0);
  }

  legacyEncryptedWalletRows(): Record<string, unknown>[] {
    return this.db.prepare(`
      SELECT * FROM wallets
      WHERE (private_key IS NULL OR private_key = '')
        AND vault_ciphertext IS NOT NULL
      ORDER BY created_at ASC
    `).all() as Record<string, unknown>[];
  }

  updateWalletPrivateKey(id: string, privateKey: string): void {
    this.db.prepare('UPDATE wallets SET private_key = ?, updated_at = ? WHERE id = ?').run(privateKey, nowIso(), id);
  }

  nextWalletLabelIndex(prefix: string): number {
    const rows = this.db.prepare('SELECT label FROM wallets WHERE label LIKE ?').all(`${prefix}-%`) as Array<{ label: string }>;
    const pattern = new RegExp(`^${escapeRegExp(prefix)}-(\\d+)$`, 'i');
    const max = rows.reduce((highest, row) => {
      const match = String(row.label).match(pattern);
      return match ? Math.max(highest, Number(match[1])) : highest;
    }, 0);
    return max + 1;
  }

  walletLabelExists(label: string, exceptWalletId?: string): boolean {
    const row = exceptWalletId
      ? this.db.prepare('SELECT id FROM wallets WHERE lower(label) = lower(?) AND id <> ? LIMIT 1').get(label, exceptWalletId)
      : this.db.prepare('SELECT id FROM wallets WHERE lower(label) = lower(?) LIMIT 1').get(label);
    return Boolean(row);
  }

  updateWalletLabel(walletId: string, label: string): WalletRecord {
    const wallet = this.walletById(walletId);
    if (!wallet) throw new Error('wallet_not_found');
    const next = label.trim();
    if (!next) throw new Error('wallet_label_required');
    if (this.walletLabelExists(next, walletId)) throw new Error('wallet_label_already_exists');
    this.db.prepare('UPDATE wallets SET label = ?, updated_at = ? WHERE id = ?').run(next, nowIso(), walletId);
    this.addWalletHistory({
      walletId,
      type: 'wallet_label_updated',
      status: 'confirmed',
      metadata: { before: wallet.label, after: next }
    });
    const updated = this.walletById(walletId);
    if (!updated) throw new Error('wallet_not_found');
    return updated;
  }

  insertWallet(input: {
    id: string;
    address: string;
    privateKey?: string | null;
    label: string;
    tags: string[];
    source: WalletRecord['source'];
    vaultSalt?: string | null;
    vaultIv?: string | null;
    vaultAuthTag?: string | null;
    vaultCiphertext?: string | null;
  }): boolean {
    const time = nowIso();
    const result = this.db.prepare(`
      INSERT OR IGNORE INTO wallets (
        id, address, private_key, label, tags, source, status, balance_wei, balance_bnb,
        use_count, created_at, updated_at, vault_salt, vault_iv, vault_auth_tag, vault_ciphertext
      ) VALUES (?, ?, ?, ?, ?, ?, 'available', '0', '0', 0, ?, ?, ?, ?, ?, ?)
    `).run(
      input.id,
      input.address,
      input.privateKey ?? null,
      input.label,
      JSON.stringify(input.tags),
      input.source,
      time,
      time,
      input.vaultSalt ?? null,
      input.vaultIv ?? null,
      input.vaultAuthTag ?? null,
      input.vaultCiphertext ?? null
    );
    return result.changes > 0;
  }

  listWallets(filters: { groupId?: string; status?: string; tag?: string; search?: string } = {}): WalletRecord[] {
    const clauses: string[] = [];
    const params: SQLInputValue[] = [];
    if (filters.groupId) {
      clauses.push('active_group_id = ?');
      params.push(filters.groupId);
    }
    if (filters.status) {
      clauses.push('status = ?');
      params.push(filters.status);
    }
    if (filters.tag) {
      clauses.push('tags LIKE ?');
      params.push(`%"${filters.tag}"%`);
    }
    if (filters.search) {
      clauses.push('(lower(address) LIKE lower(?) OR lower(label) LIKE lower(?))');
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.db.prepare(`
      SELECT * FROM wallets ${where}
      ORDER BY
        CASE WHEN dev_rank IS NULL THEN 1 ELSE 0 END,
        dev_rank ASC,
        CASE WHEN prime_rank IS NULL THEN 1 ELSE 0 END,
        prime_rank ASC,
        created_at DESC
    `).all(...params) as Record<string, unknown>[];
    return rows.map(walletFromRow);
  }

  listDevWallets(): WalletRecord[] {
    const rows = this.db.prepare(`
      SELECT * FROM wallets
      WHERE dev_rank IS NOT NULL
      ORDER BY dev_rank ASC, created_at ASC
    `).all() as Record<string, unknown>[];
    return rows.map(walletFromRow);
  }

  setWalletPrimeRank(walletId: string, primeRank: number | null): WalletRecord {
    if (primeRank !== null && (!Number.isInteger(primeRank) || primeRank < 1 || primeRank > 5)) {
      throw new Error('prime_rank_must_be_1_5_or_null');
    }
    const time = nowIso();
    this.db.exec('BEGIN');
    try {
      if (primeRank !== null) {
        this.db.prepare('UPDATE wallets SET prime_rank = NULL, updated_at = ? WHERE prime_rank = ? AND id <> ?')
          .run(time, primeRank, walletId);
      }
      this.db.prepare('UPDATE wallets SET prime_rank = ?, updated_at = ? WHERE id = ?')
        .run(primeRank, time, walletId);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    const wallet = this.walletById(walletId);
    if (!wallet) throw new Error('wallet_not_found');
    return wallet;
  }

  setWalletDevConfig(walletId: string, input: { devRank: number | null; devRole?: string | null; devNotes?: string | null }): WalletRecord {
    const devRank = input.devRank;
    if (devRank !== null && (!Number.isInteger(devRank) || devRank < 1 || devRank > 20)) {
      throw new Error('dev_rank_must_be_1_20_or_null');
    }
    const time = nowIso();
    this.db.exec('BEGIN');
    try {
      if (devRank !== null) {
        this.db.prepare('UPDATE wallets SET dev_rank = NULL, dev_role = NULL, dev_notes = NULL, updated_at = ? WHERE dev_rank = ? AND id <> ?')
          .run(time, devRank, walletId);
      }
      this.db.prepare(`
        UPDATE wallets
        SET dev_rank = ?,
            dev_role = ?,
            dev_notes = ?,
            updated_at = ?
        WHERE id = ?
      `).run(
        devRank,
        devRank === null ? null : input.devRole?.trim() || 'creator',
        devRank === null ? null : input.devNotes?.trim() || null,
        time,
        walletId
      );
      this.addWalletHistory({
        walletId,
        type: devRank === null ? 'dev_wallet_removed' : 'dev_wallet_configured',
        status: 'confirmed',
        notes: devRank === null ? 'Removed from dev wallet slots' : `DEV ${devRank} ${input.devRole?.trim() || 'creator'}`,
        metadata: { devRank, devRole: input.devRole?.trim() || null }
      });
      if (devRank !== null) {
        this.addTagsToWallets([walletId], ['DEV']);
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    const wallet = this.walletById(walletId);
    if (!wallet) throw new Error('wallet_not_found');
    return wallet;
  }

  updateWalletTags(walletId: string, input: { set?: string[]; add?: string[]; remove?: string[] }): WalletRecord {
    const wallet = this.walletById(walletId);
    if (!wallet) throw new Error('wallet_not_found');
    const clean = (values: string[] | undefined): string[] => [...new Set((values ?? []).map((tag) => tag.trim()).filter(Boolean))];
    const remove = new Set(clean(input.remove));
    const base = input.set ? clean(input.set) : wallet.tags;
    const next = [...new Set([...base, ...clean(input.add)].filter((tag) => !remove.has(tag)))];
    this.db.prepare('UPDATE wallets SET tags = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(next), nowIso(), walletId);
    this.addWalletHistory({
      walletId,
      type: 'wallet_tags_updated',
      status: 'confirmed',
      metadata: { before: wallet.tags, after: next }
    });
    const updated = this.walletById(walletId);
    if (!updated) throw new Error('wallet_not_found');
    return updated;
  }

  addTagsToWallets(walletIds: string[], tags: string[]): void {
    const cleanTags = [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
    if (!cleanTags.length) return;
    for (const walletId of walletIds) {
      const wallet = this.walletById(walletId);
      if (!wallet) continue;
      const next = [...new Set([...wallet.tags, ...cleanTags])];
      if (next.length === wallet.tags.length) continue;
      this.db.prepare('UPDATE wallets SET tags = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(next), nowIso(), walletId);
    }
  }

  addWalletHistory(input: {
    id?: string;
    walletId: string;
    type: string;
    groupId?: string | null;
    tokenAddress?: string | null;
    tokenSymbol?: string | null;
    campaignName?: string | null;
    amountWei?: string | null;
    amountBNB?: string | null;
    status?: string;
    notes?: string | null;
    metadata?: Record<string, unknown>;
    createdAt?: string;
  }): void {
    this.db.prepare(`
      INSERT INTO wallet_history (
        id, wallet_id, type, group_id, token_address, token_symbol,
        campaign_name, amount_wei, amount_bnb, status, notes, metadata, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.id ?? `wh_${randomUUID()}`,
      input.walletId,
      input.type,
      input.groupId ?? null,
      input.tokenAddress ?? null,
      input.tokenSymbol ?? null,
      input.campaignName ?? null,
      input.amountWei ?? null,
      input.amountBNB ?? null,
      input.status ?? 'recorded',
      input.notes ?? null,
      JSON.stringify(input.metadata ?? {}),
      input.createdAt ?? nowIso()
    );
  }

  listWalletHistory(filters: { walletId?: string; groupId?: string; tokenAddress?: string; limit?: number } = {}): WalletHistoryRecord[] {
    const clauses: string[] = [];
    const params: SQLInputValue[] = [];
    if (filters.walletId) {
      clauses.push('h.wallet_id = ?');
      params.push(filters.walletId);
    }
    if (filters.groupId) {
      clauses.push('h.group_id = ?');
      params.push(filters.groupId);
    }
    if (filters.tokenAddress) {
      clauses.push('lower(h.token_address) = lower(?)');
      params.push(filters.tokenAddress);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    params.push(Math.min(Math.max(filters.limit ?? 120, 1), 500));
    const rows = this.db.prepare(`
      SELECT
        h.*,
        w.address AS wallet_address,
        w.label AS wallet_label,
        g.name AS group_name
      FROM wallet_history h
      JOIN wallets w ON w.id = h.wallet_id
      LEFT JOIN groups g ON g.id = h.group_id
      ${where}
      ORDER BY h.created_at DESC
      LIMIT ?
    `).all(...params) as Record<string, unknown>[];
    return rows.map(walletHistoryFromRow);
  }

  upsertWalletTokenPosition(input: {
    walletId: string;
    tokenAddress: string;
    groupId?: string | null;
    campaignName?: string | null;
    tokenSymbol: string;
    tokenDecimals: number;
    tokenBalanceRaw: string;
    tokenBalance: string;
    tokenUsdValue?: number | null;
    plannedCostUsd?: number | null;
    pnlUsd?: number | null;
  }): { created: boolean } {
    const existing = this.db.prepare(`
      SELECT wallet_id FROM wallet_token_positions
      WHERE wallet_id = ? AND lower(token_address) = lower(?)
    `).get(input.walletId, input.tokenAddress) as Record<string, unknown> | undefined;
    const time = nowIso();
    this.db.prepare(`
      INSERT INTO wallet_token_positions (
        wallet_id, token_address, group_id, campaign_name, token_symbol, token_decimals,
        token_balance_raw, token_balance, token_usd_value, planned_cost_usd, pnl_usd,
        first_seen_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(wallet_id, token_address) DO UPDATE SET
        group_id = excluded.group_id,
        campaign_name = excluded.campaign_name,
        token_symbol = excluded.token_symbol,
        token_decimals = excluded.token_decimals,
        token_balance_raw = excluded.token_balance_raw,
        token_balance = excluded.token_balance,
        token_usd_value = excluded.token_usd_value,
        planned_cost_usd = excluded.planned_cost_usd,
        pnl_usd = excluded.pnl_usd,
        updated_at = excluded.updated_at
    `).run(
      input.walletId,
      input.tokenAddress,
      input.groupId ?? null,
      input.campaignName ?? null,
      input.tokenSymbol,
      input.tokenDecimals,
      input.tokenBalanceRaw,
      input.tokenBalance,
      input.tokenUsdValue ?? null,
      input.plannedCostUsd ?? null,
      input.pnlUsd ?? null,
      time,
      time
    );
    return { created: !existing };
  }

  listWalletTokenPositions(filters: { walletId?: string; groupId?: string; tokenAddress?: string } = {}): WalletTokenPositionRecord[] {
    const clauses: string[] = [];
    const params: SQLInputValue[] = [];
    if (filters.walletId) {
      clauses.push('p.wallet_id = ?');
      params.push(filters.walletId);
    }
    if (filters.groupId) {
      clauses.push('p.group_id = ?');
      params.push(filters.groupId);
    }
    if (filters.tokenAddress) {
      clauses.push('lower(p.token_address) = lower(?)');
      params.push(filters.tokenAddress);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.db.prepare(`
      SELECT
        p.*,
        w.address AS wallet_address,
        w.label AS wallet_label,
        g.name AS group_name
      FROM wallet_token_positions p
      JOIN wallets w ON w.id = p.wallet_id
      LEFT JOIN groups g ON g.id = p.group_id
      ${where}
      ORDER BY p.updated_at DESC
    `).all(...params) as Record<string, unknown>[];
    return rows.map(tokenPositionFromRow);
  }

  insertLaunchDraft(input: {
    id: string;
    campaignName?: string | null;
    groupIds?: string[];
    devWalletId?: string | null;
    tokenAddress?: string | null;
    name: string;
    shortName: string;
    description: string;
    imgUrl?: string;
    imageFilePath?: string | null;
    label?: string;
    webUrl?: string;
    twitterUrl?: string;
    telegramUrl?: string;
    raisedSymbol: string;
    raisedTokenAddress?: string;
    raisedTokenSnapshot?: Record<string, unknown>;
    preSale?: string;
    onlyMPC?: boolean;
    feePlan?: boolean;
    status?: string;
    controls?: Record<string, unknown>;
    triggers?: Array<Record<string, unknown>>;
    createBodyPreview?: Record<string, unknown>;
    createDryRunPlan?: Record<string, unknown>;
    note?: string | null;
  }): LaunchDraftRecord {
    const time = nowIso();
    this.db.prepare(`
      INSERT INTO launch_drafts (
        id, campaign_name, group_ids, dev_wallet_id, token_address,
        name, short_name, description, img_url, image_file_path, label,
        web_url, twitter_url, telegram_url, raised_symbol, raised_token_address,
        raised_token_snapshot, pre_sale, only_mpc, fee_plan, status, controls,
        triggers, create_body_preview, create_dry_run_plan, note, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.id,
      input.campaignName ?? null,
      JSON.stringify(input.groupIds ?? []),
      input.devWalletId ?? null,
      input.tokenAddress ?? null,
      input.name,
      input.shortName,
      input.description,
      input.imgUrl ?? '',
      input.imageFilePath ?? null,
      input.label ?? 'Meme',
      input.webUrl ?? '',
      input.twitterUrl ?? '',
      input.telegramUrl ?? '',
      input.raisedSymbol,
      input.raisedTokenAddress ?? '',
      JSON.stringify(input.raisedTokenSnapshot ?? {}),
      input.preSale ?? '0',
      input.onlyMPC ? 1 : 0,
      input.feePlan === false ? 0 : 1,
      input.status ?? 'draft',
      JSON.stringify(input.controls ?? {}),
      JSON.stringify(input.triggers ?? []),
      JSON.stringify(input.createBodyPreview ?? {}),
      JSON.stringify(input.createDryRunPlan ?? {}),
      input.note ?? null,
      time,
      time
    );
    const created = this.launchDraftById(input.id);
    if (!created) throw new Error('launch_draft_create_failed');
    return created;
  }

  launchDraftById(id: string): LaunchDraftRecord | null {
    const row = this.db.prepare(`
      SELECT d.*, w.label AS dev_wallet_label, w.address AS dev_wallet_address
      FROM launch_drafts d
      LEFT JOIN wallets w ON w.id = d.dev_wallet_id
      WHERE d.id = ?
    `).get(id) as Record<string, unknown> | undefined;
    return row ? launchDraftFromRow(row) : null;
  }

  listLaunchDrafts(filters: { status?: string; groupId?: string; campaignName?: string; limit?: number } = {}): LaunchDraftRecord[] {
    const clauses: string[] = [];
    const params: SQLInputValue[] = [];
    if (filters.status) {
      clauses.push('d.status = ?');
      params.push(filters.status);
    }
    if (filters.groupId) {
      clauses.push('d.group_ids LIKE ?');
      params.push(`%"${filters.groupId}"%`);
    }
    if (filters.campaignName) {
      clauses.push('lower(d.campaign_name) LIKE lower(?)');
      params.push(`%${filters.campaignName}%`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    params.push(Math.min(Math.max(filters.limit ?? 100, 1), 300));
    const rows = this.db.prepare(`
      SELECT d.*, w.label AS dev_wallet_label, w.address AS dev_wallet_address
      FROM launch_drafts d
      LEFT JOIN wallets w ON w.id = d.dev_wallet_id
      ${where}
      ORDER BY d.created_at DESC
      LIMIT ?
    `).all(...params) as Record<string, unknown>[];
    return rows.map(launchDraftFromRow);
  }

  updateLaunchDraftPlan(id: string, input: {
    status?: string;
    controls?: Record<string, unknown>;
    triggers?: Array<Record<string, unknown>>;
    createDryRunPlan?: Record<string, unknown>;
    tokenAddress?: string | null;
    note?: string | null;
  }): LaunchDraftRecord {
    const draft = this.launchDraftById(id);
    if (!draft) throw new Error('launch_draft_not_found');
    this.db.prepare(`
      UPDATE launch_drafts
      SET status = ?,
          controls = ?,
          triggers = ?,
          create_dry_run_plan = ?,
          token_address = ?,
          note = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      input.status ?? draft.status,
      JSON.stringify(input.controls ?? draft.controls),
      JSON.stringify(input.triggers ?? draft.triggers),
      JSON.stringify(input.createDryRunPlan ?? draft.createDryRunPlan),
      input.tokenAddress === undefined ? draft.tokenAddress : input.tokenAddress,
      input.note === undefined ? draft.note : input.note,
      nowIso(),
      id
    );
    const updated = this.launchDraftById(id);
    if (!updated) throw new Error('launch_draft_not_found');
    return updated;
  }

  insertTerminalCampaign(input: {
    id: string;
    name: string;
    groupIds?: string[];
    devWalletIds?: string[];
    tags?: string[];
    metadata?: Record<string, unknown>;
    status?: TerminalCampaignRecord['status'];
  }): TerminalCampaignRecord {
    const time = nowIso();
    this.db.prepare(`
      INSERT INTO terminal_campaigns (
        id, name, status, group_ids, dev_wallet_ids, tags, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.id,
      input.name,
      input.status ?? 'active',
      JSON.stringify(input.groupIds ?? []),
      JSON.stringify(input.devWalletIds ?? []),
      JSON.stringify(input.tags ?? []),
      JSON.stringify(input.metadata ?? {}),
      time,
      time
    );
    const created = this.terminalCampaignById(input.id);
    if (!created) throw new Error('terminal_campaign_create_failed');
    return created;
  }

  terminalCampaignById(id: string): TerminalCampaignRecord | null {
    const row = this.db.prepare(`
      SELECT c.*, COUNT(t.id) AS token_count
      FROM terminal_campaigns c
      LEFT JOIN terminal_tokens t ON t.campaign_id = c.id AND t.status <> 'archived'
      WHERE c.id = ?
      GROUP BY c.id
    `).get(id) as Record<string, unknown> | undefined;
    return row ? terminalCampaignFromRow(row) : null;
  }

  listTerminalCampaigns(filters: { status?: string; limit?: number } = {}): TerminalCampaignRecord[] {
    const clauses: string[] = [];
    const params: SQLInputValue[] = [];
    if (filters.status) {
      clauses.push('c.status = ?');
      params.push(filters.status);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    params.push(Math.min(Math.max(filters.limit ?? 100, 1), 300));
    const rows = this.db.prepare(`
      SELECT c.*, COUNT(t.id) AS token_count
      FROM terminal_campaigns c
      LEFT JOIN terminal_tokens t ON t.campaign_id = c.id AND t.status <> 'archived'
      ${where}
      GROUP BY c.id
      ORDER BY c.created_at DESC
      LIMIT ?
    `).all(...params) as Record<string, unknown>[];
    return rows.map(terminalCampaignFromRow);
  }

  updateTerminalCampaignStatus(id: string, status: TerminalCampaignRecord['status']): TerminalCampaignRecord {
    this.db.prepare('UPDATE terminal_campaigns SET status = ?, updated_at = ? WHERE id = ?').run(status, nowIso(), id);
    const updated = this.terminalCampaignById(id);
    if (!updated) throw new Error('terminal_campaign_not_found');
    return updated;
  }

  insertTerminalToken(input: {
    id: string;
    name: string;
    symbol: string;
    tokenAddress?: string | null;
    launchpad?: string;
    chainId?: number;
    status?: TerminalTokenRecord['status'];
    campaignId?: string | null;
    campaignName?: string | null;
    groupId?: string | null;
    devWalletId?: string | null;
    launchDraftId?: string | null;
    imageUrl?: string | null;
    tags?: string[];
    metadata?: Record<string, unknown>;
  }): TerminalTokenRecord {
    const time = nowIso();
    this.db.prepare(`
      INSERT INTO terminal_tokens (
        id, name, symbol, token_address, launchpad, chain_id, status,
        campaign_id, campaign_name, group_id, dev_wallet_id, launch_draft_id,
        image_url, tags, metadata, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.id,
      input.name,
      input.symbol,
      input.tokenAddress ?? null,
      input.launchpad ?? 'four_meme',
      input.chainId ?? 56,
      input.status ?? 'draft',
      input.campaignId ?? null,
      input.campaignName ?? null,
      input.groupId ?? null,
      input.devWalletId ?? null,
      input.launchDraftId ?? null,
      input.imageUrl ?? null,
      JSON.stringify(input.tags ?? []),
      JSON.stringify(input.metadata ?? {}),
      time,
      time
    );
    const created = this.terminalTokenById(input.id);
    if (!created) throw new Error('terminal_token_create_failed');
    return created;
  }

  terminalTokenById(id: string): TerminalTokenRecord | null {
    const row = this.db.prepare(`
      SELECT
        t.*,
        g.name AS group_name,
        w.label AS dev_wallet_label,
        w.address AS dev_wallet_address
      FROM terminal_tokens t
      LEFT JOIN groups g ON g.id = t.group_id
      LEFT JOIN wallets w ON w.id = t.dev_wallet_id
      WHERE t.id = ?
    `).get(id) as Record<string, unknown> | undefined;
    return row ? terminalTokenFromRow(row) : null;
  }

  listTerminalTokens(filters: { status?: string; campaignId?: string; launchpad?: string; limit?: number } = {}): TerminalTokenRecord[] {
    const clauses: string[] = [];
    const params: SQLInputValue[] = [];
    if (filters.status) {
      clauses.push('t.status = ?');
      params.push(filters.status);
    }
    if (filters.campaignId) {
      clauses.push('t.campaign_id = ?');
      params.push(filters.campaignId);
    }
    if (filters.launchpad) {
      clauses.push('t.launchpad = ?');
      params.push(filters.launchpad);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    params.push(Math.min(Math.max(filters.limit ?? 150, 1), 500));
    const rows = this.db.prepare(`
      SELECT
        t.*,
        g.name AS group_name,
        w.label AS dev_wallet_label,
        w.address AS dev_wallet_address
      FROM terminal_tokens t
      LEFT JOIN groups g ON g.id = t.group_id
      LEFT JOIN wallets w ON w.id = t.dev_wallet_id
      ${where}
      ORDER BY t.created_at DESC
      LIMIT ?
    `).all(...params) as Record<string, unknown>[];
    return rows.map(terminalTokenFromRow);
  }

  updateTerminalTokenStatus(id: string, status: TerminalTokenRecord['status']): TerminalTokenRecord {
    this.db.prepare('UPDATE terminal_tokens SET status = ?, updated_at = ? WHERE id = ?').run(status, nowIso(), id);
    const updated = this.terminalTokenById(id);
    if (!updated) throw new Error('terminal_token_not_found');
    return updated;
  }

  insertTerminalTask(input: {
    id: string;
    tokenId?: string | null;
    name: string;
    kind: TerminalTaskRecord['kind'];
    triggerType?: TerminalTaskRecord['triggerType'];
    triggerValue?: string | null;
    walletIds?: string[];
    groupId?: string | null;
    params?: Record<string, unknown>;
  }): TerminalTaskRecord {
    const time = nowIso();
    this.db.prepare(`
      INSERT INTO terminal_tasks (
        id, token_id, name, kind, status, trigger_type, trigger_value,
        wallet_ids, group_id, params, dry_run_plan, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?, '{}', ?, ?)
    `).run(
      input.id,
      input.tokenId ?? null,
      input.name,
      input.kind,
      input.triggerType ?? 'manual',
      input.triggerValue ?? null,
      JSON.stringify(input.walletIds ?? []),
      input.groupId ?? null,
      JSON.stringify(input.params ?? {}),
      time,
      time
    );
    const created = this.terminalTaskById(input.id);
    if (!created) throw new Error('terminal_task_create_failed');
    return created;
  }

  terminalTaskById(id: string): TerminalTaskRecord | null {
    const row = this.db.prepare(`
      SELECT
        task.*,
        token.name AS token_name,
        token.symbol AS token_symbol,
        g.name AS group_name
      FROM terminal_tasks task
      LEFT JOIN terminal_tokens token ON token.id = task.token_id
      LEFT JOIN groups g ON g.id = task.group_id
      WHERE task.id = ?
    `).get(id) as Record<string, unknown> | undefined;
    return row ? terminalTaskFromRow(row) : null;
  }

  listTerminalTasks(filters: { tokenId?: string; status?: string; limit?: number } = {}): TerminalTaskRecord[] {
    const clauses: string[] = [];
    const params: SQLInputValue[] = [];
    if (filters.tokenId) {
      clauses.push('task.token_id = ?');
      params.push(filters.tokenId);
    }
    if (filters.status) {
      clauses.push('task.status = ?');
      params.push(filters.status);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    params.push(Math.min(Math.max(filters.limit ?? 150, 1), 500));
    const rows = this.db.prepare(`
      SELECT
        task.*,
        token.name AS token_name,
        token.symbol AS token_symbol,
        g.name AS group_name
      FROM terminal_tasks task
      LEFT JOIN terminal_tokens token ON token.id = task.token_id
      LEFT JOIN groups g ON g.id = task.group_id
      ${where}
      ORDER BY task.created_at DESC
      LIMIT ?
    `).all(...params) as Record<string, unknown>[];
    return rows.map(terminalTaskFromRow);
  }

  updateTerminalTaskPlan(id: string, input: {
    status?: TerminalTaskRecord['status'];
    dryRunPlan?: Record<string, unknown>;
    lastError?: string | null;
  }): TerminalTaskRecord {
    const task = this.terminalTaskById(id);
    if (!task) throw new Error('terminal_task_not_found');
    this.db.prepare(`
      UPDATE terminal_tasks
      SET status = ?,
          dry_run_plan = ?,
          last_error = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      input.status ?? task.status,
      JSON.stringify(input.dryRunPlan ?? task.dryRunPlan),
      input.lastError === undefined ? task.lastError : input.lastError,
      nowIso(),
      id
    );
    const updated = this.terminalTaskById(id);
    if (!updated) throw new Error('terminal_task_not_found');
    return updated;
  }

  insertTerminalAutomation(input: {
    id: string;
    tokenId?: string | null;
    name: string;
    status?: TerminalAutomationRecord['status'];
    triggerType: TerminalAutomationRecord['triggerType'];
    triggerValue?: string | null;
    taskIds?: string[];
  }): TerminalAutomationRecord {
    const time = nowIso();
    this.db.prepare(`
      INSERT INTO terminal_automations (
        id, token_id, name, status, trigger_type, trigger_value, task_ids, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.id,
      input.tokenId ?? null,
      input.name,
      input.status ?? 'active',
      input.triggerType,
      input.triggerValue ?? null,
      JSON.stringify(input.taskIds ?? []),
      time,
      time
    );
    const created = this.terminalAutomationById(input.id);
    if (!created) throw new Error('terminal_automation_create_failed');
    return created;
  }

  terminalAutomationById(id: string): TerminalAutomationRecord | null {
    const row = this.db.prepare(`
      SELECT
        automation.*,
        token.name AS token_name,
        token.symbol AS token_symbol
      FROM terminal_automations automation
      LEFT JOIN terminal_tokens token ON token.id = automation.token_id
      WHERE automation.id = ?
    `).get(id) as Record<string, unknown> | undefined;
    return row ? terminalAutomationFromRow(row) : null;
  }

  listTerminalAutomations(filters: { status?: string; tokenId?: string; limit?: number } = {}): TerminalAutomationRecord[] {
    const clauses: string[] = [];
    const params: SQLInputValue[] = [];
    if (filters.status) {
      clauses.push('automation.status = ?');
      params.push(filters.status);
    }
    if (filters.tokenId) {
      clauses.push('automation.token_id = ?');
      params.push(filters.tokenId);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    params.push(Math.min(Math.max(filters.limit ?? 150, 1), 500));
    const rows = this.db.prepare(`
      SELECT
        automation.*,
        token.name AS token_name,
        token.symbol AS token_symbol
      FROM terminal_automations automation
      LEFT JOIN terminal_tokens token ON token.id = automation.token_id
      ${where}
      ORDER BY automation.created_at DESC
      LIMIT ?
    `).all(...params) as Record<string, unknown>[];
    return rows.map(terminalAutomationFromRow);
  }

  updateTerminalAutomationStatus(id: string, status: TerminalAutomationRecord['status']): TerminalAutomationRecord {
    this.db.prepare('UPDATE terminal_automations SET status = ?, updated_at = ? WHERE id = ?').run(status, nowIso(), id);
    const updated = this.terminalAutomationById(id);
    if (!updated) throw new Error('terminal_automation_not_found');
    return updated;
  }

  insertBlueprint(input: {
    id: string;
    name: string;
    description?: string | null;
    walletSlots?: Array<Record<string, unknown>>;
    taskTemplates?: Array<Record<string, unknown>>;
    settings?: Record<string, unknown>;
    status?: BlueprintRecord['status'];
  }): BlueprintRecord {
    const time = nowIso();
    this.db.prepare(`
      INSERT INTO blueprints (
        id, name, description, wallet_slots, task_templates, settings, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.id,
      input.name,
      input.description ?? null,
      JSON.stringify(input.walletSlots ?? []),
      JSON.stringify(input.taskTemplates ?? []),
      JSON.stringify(input.settings ?? {}),
      input.status ?? 'active',
      time,
      time
    );
    const created = this.blueprintById(input.id);
    if (!created) throw new Error('blueprint_create_failed');
    return created;
  }

  blueprintById(id: string): BlueprintRecord | null {
    const row = this.db.prepare('SELECT * FROM blueprints WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? blueprintFromRow(row) : null;
  }

  listBlueprints(filters: { status?: string; limit?: number } = {}): BlueprintRecord[] {
    const clauses: string[] = [];
    const params: SQLInputValue[] = [];
    if (filters.status) {
      clauses.push('status = ?');
      params.push(filters.status);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    params.push(Math.min(Math.max(filters.limit ?? 100, 1), 300));
    const rows = this.db.prepare(`
      SELECT * FROM blueprints
      ${where}
      ORDER BY created_at DESC
      LIMIT ?
    `).all(...params) as Record<string, unknown>[];
    return rows.map(blueprintFromRow);
  }

  updateBlueprintStatus(id: string, status: BlueprintRecord['status']): BlueprintRecord {
    this.db.prepare('UPDATE blueprints SET status = ?, updated_at = ? WHERE id = ?').run(status, nowIso(), id);
    const updated = this.blueprintById(id);
    if (!updated) throw new Error('blueprint_not_found');
    return updated;
  }

  upsertAppSetting(key: string, value: string): AppSettingRecord {
    const time = nowIso();
    this.db.prepare(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(key, value, time);
    const row = this.db.prepare('SELECT * FROM app_settings WHERE key = ?').get(key) as Record<string, unknown> | undefined;
    if (!row) throw new Error('app_setting_update_failed');
    return { key: String(row.key), value: String(row.value), updatedAt: String(row.updated_at) };
  }

  listAppSettings(): AppSettingRecord[] {
    const rows = this.db.prepare('SELECT * FROM app_settings ORDER BY key ASC').all() as Record<string, unknown>[];
    return rows.map((row) => ({
      key: String(row.key),
      value: String(row.value),
      updatedAt: String(row.updated_at)
    }));
  }

  insertTokenPriceSnapshot(input: {
    tokenAddress: string;
    priceUsd: number | null;
    source: string;
    marketCapUsd?: number | null;
    progress?: number | null;
    fourMemeStatus?: string | null;
    liquidityUsd?: number | null;
    volume24hUsd?: number | null;
    metadata?: Record<string, unknown>;
  }): TokenPriceSnapshotRecord {
    const id = `tps_${randomUUID()}`;
    const createdAt = nowIso();
    this.db.prepare(`
      INSERT INTO token_price_snapshots (
        id, token_address, price_usd, source, market_cap_usd, progress,
        four_meme_status, liquidity_usd, volume_24h_usd, metadata, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.tokenAddress,
      input.priceUsd,
      input.source,
      input.marketCapUsd ?? null,
      input.progress ?? null,
      input.fourMemeStatus ?? null,
      input.liquidityUsd ?? null,
      input.volume24hUsd ?? null,
      JSON.stringify(input.metadata ?? {}),
      createdAt
    );
    const row = this.db.prepare('SELECT * FROM token_price_snapshots WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!row) throw new Error('token_price_snapshot_create_failed');
    return tokenPriceSnapshotFromRow(row);
  }

  listTokenPriceSnapshots(tokenAddress: string, limit = 100): TokenPriceSnapshotRecord[] {
    const rows = this.db.prepare(`
      SELECT * FROM token_price_snapshots
      WHERE lower(token_address) = lower(?)
      ORDER BY created_at DESC
      LIMIT ?
    `).all(tokenAddress, Math.min(Math.max(limit, 1), 500)) as Record<string, unknown>[];
    return rows.map(tokenPriceSnapshotFromRow);
  }

  upsertBnbPriceSnapshot(input: {
    symbol?: 'BNBUSDT';
    priceUsd: number;
    source: string;
    interval?: string;
    openTimeMs: number;
    closeTimeMs: number;
    openUsd: number;
    highUsd: number;
    lowUsd: number;
    closeUsd: number;
    volume?: string | null;
    metadata?: Record<string, unknown>;
  }): BnbPriceSnapshotRecord {
    const id = `bps_${randomUUID()}`;
    const symbol = input.symbol ?? 'BNBUSDT';
    const interval = input.interval ?? '1m';
    const createdAt = nowIso();
    this.db.prepare(`
      INSERT INTO bnb_price_snapshots (
        id, symbol, price_usd, source, interval, open_time_ms, close_time_ms,
        open_usd, high_usd, low_usd, close_usd, volume, metadata, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(symbol, interval, open_time_ms, source) DO UPDATE SET
        price_usd = excluded.price_usd,
        close_time_ms = excluded.close_time_ms,
        open_usd = excluded.open_usd,
        high_usd = excluded.high_usd,
        low_usd = excluded.low_usd,
        close_usd = excluded.close_usd,
        volume = excluded.volume,
        metadata = excluded.metadata,
        created_at = excluded.created_at
    `).run(
      id,
      symbol,
      input.priceUsd,
      input.source,
      interval,
      input.openTimeMs,
      input.closeTimeMs,
      input.openUsd,
      input.highUsd,
      input.lowUsd,
      input.closeUsd,
      input.volume ?? null,
      JSON.stringify(input.metadata ?? {}),
      createdAt
    );
    const row = this.db.prepare(`
      SELECT * FROM bnb_price_snapshots
      WHERE symbol = ? AND interval = ? AND open_time_ms = ? AND source = ?
      LIMIT 1
    `).get(symbol, interval, input.openTimeMs, input.source) as Record<string, unknown> | undefined;
    if (!row) throw new Error('bnb_price_snapshot_create_failed');
    return bnbPriceSnapshotFromRow(row);
  }

  bnbPriceSnapshotAt(timestampMs: number, interval = '1m'): BnbPriceSnapshotRecord | null {
    const row = this.db.prepare(`
      SELECT * FROM bnb_price_snapshots
      WHERE symbol = 'BNBUSDT'
        AND interval = ?
        AND open_time_ms <= ?
        AND close_time_ms >= ?
      ORDER BY
        CASE source WHEN 'binance_spot_kline' THEN 0 ELSE 1 END,
        created_at DESC
      LIMIT 1
    `).get(interval, timestampMs, timestampMs) as Record<string, unknown> | undefined;
    return row ? bnbPriceSnapshotFromRow(row) : null;
  }

  insertPositionFill(input: {
    walletId: string;
    tokenId?: string | null;
    tokenAddress: string;
    tokenSymbol: string;
    side: PositionFillRecord['side'];
    status: PositionFillRecord['status'];
    source: PositionFillRecord['source'];
    quantityRaw?: string | null;
    quantityTokens?: string | null;
    tokenDecimals?: number;
    priceUsd?: number | null;
    valueUsd?: number | null;
    costBasisUsd?: number | null;
    realizedPnlUsd?: number | null;
    bnbAmountWei?: string | null;
    bnbAmount?: string | null;
    bnbPriceUsd?: number | null;
    txHash?: string | null;
    groupId?: string | null;
    campaignName?: string | null;
    launchDraftId?: string | null;
    taskId?: string | null;
    notes?: string | null;
    metadata?: Record<string, unknown>;
    createdAt?: string;
  }): PositionFillRecord {
    const id = `fill_${randomUUID()}`;
    const createdAt = input.createdAt ?? nowIso();
    this.db.prepare(`
      INSERT INTO position_fills (
        id, wallet_id, token_id, token_address, token_symbol, side, status, source,
        quantity_raw, quantity_tokens, token_decimals, price_usd, value_usd,
        cost_basis_usd, realized_pnl_usd, bnb_amount_wei, bnb_amount, bnb_price_usd,
        tx_hash, group_id, campaign_name, launch_draft_id, task_id, notes, metadata, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.walletId,
      input.tokenId ?? null,
      input.tokenAddress,
      input.tokenSymbol,
      input.side,
      input.status,
      input.source,
      input.quantityRaw ?? null,
      input.quantityTokens ?? null,
      input.tokenDecimals ?? 18,
      input.priceUsd ?? null,
      input.valueUsd ?? null,
      input.costBasisUsd ?? null,
      input.realizedPnlUsd ?? null,
      input.bnbAmountWei ?? null,
      input.bnbAmount ?? null,
      input.bnbPriceUsd ?? null,
      input.txHash ?? null,
      input.groupId ?? null,
      input.campaignName ?? null,
      input.launchDraftId ?? null,
      input.taskId ?? null,
      input.notes ?? null,
      JSON.stringify(input.metadata ?? {}),
      createdAt
    );
    const created = this.positionFillById(id);
    if (!created) throw new Error('position_fill_create_failed');
    return created;
  }

  updatePositionFillAccounting(id: string, input: {
    costBasisUsd?: number | null;
    realizedPnlUsd?: number | null;
  }): PositionFillRecord {
    const fill = this.positionFillById(id);
    if (!fill) throw new Error('position_fill_not_found');
    this.db.prepare(`
      UPDATE position_fills
      SET cost_basis_usd = ?, realized_pnl_usd = ?
      WHERE id = ?
    `).run(
      input.costBasisUsd === undefined ? fill.costBasisUsd : input.costBasisUsd,
      input.realizedPnlUsd === undefined ? fill.realizedPnlUsd : input.realizedPnlUsd,
      id
    );
    const updated = this.positionFillById(id);
    if (!updated) throw new Error('position_fill_not_found');
    return updated;
  }

  updatePositionFill(id: string, input: {
    status?: PositionFillRecord['status'];
    source?: PositionFillRecord['source'];
    quantityRaw?: string | null;
    quantityTokens?: string | null;
    tokenDecimals?: number;
    priceUsd?: number | null;
    valueUsd?: number | null;
    costBasisUsd?: number | null;
    realizedPnlUsd?: number | null;
    bnbAmountWei?: string | null;
    bnbAmount?: string | null;
    bnbPriceUsd?: number | null;
    txHash?: string | null;
    notes?: string | null;
    metadata?: Record<string, unknown>;
  }): PositionFillRecord {
    const fill = this.positionFillById(id);
    if (!fill) throw new Error('position_fill_not_found');
    this.db.prepare(`
      UPDATE position_fills
      SET status = ?,
          source = ?,
          quantity_raw = ?,
          quantity_tokens = ?,
          token_decimals = ?,
          price_usd = ?,
          value_usd = ?,
          cost_basis_usd = ?,
          realized_pnl_usd = ?,
          bnb_amount_wei = ?,
          bnb_amount = ?,
          bnb_price_usd = ?,
          tx_hash = ?,
          notes = ?,
          metadata = ?
      WHERE id = ?
    `).run(
      input.status ?? fill.status,
      input.source ?? fill.source,
      input.quantityRaw === undefined ? fill.quantityRaw : input.quantityRaw,
      input.quantityTokens === undefined ? fill.quantityTokens : input.quantityTokens,
      input.tokenDecimals ?? fill.tokenDecimals,
      input.priceUsd === undefined ? fill.priceUsd : input.priceUsd,
      input.valueUsd === undefined ? fill.valueUsd : input.valueUsd,
      input.costBasisUsd === undefined ? fill.costBasisUsd : input.costBasisUsd,
      input.realizedPnlUsd === undefined ? fill.realizedPnlUsd : input.realizedPnlUsd,
      input.bnbAmountWei === undefined ? fill.bnbAmountWei : input.bnbAmountWei,
      input.bnbAmount === undefined ? fill.bnbAmount : input.bnbAmount,
      input.bnbPriceUsd === undefined ? fill.bnbPriceUsd : input.bnbPriceUsd,
      input.txHash === undefined ? fill.txHash : input.txHash,
      input.notes === undefined ? fill.notes : input.notes,
      JSON.stringify(input.metadata ?? fill.metadata),
      id
    );
    const updated = this.positionFillById(id);
    if (!updated) throw new Error('position_fill_not_found');
    return updated;
  }

  positionFillById(id: string): PositionFillRecord | null {
    const row = this.db.prepare(`
      SELECT
        f.*,
        w.address AS wallet_address,
        w.label AS wallet_label,
        t.name AS token_name,
        g.name AS group_name
      FROM position_fills f
      JOIN wallets w ON w.id = f.wallet_id
      LEFT JOIN terminal_tokens t ON t.id = f.token_id
      LEFT JOIN groups g ON g.id = f.group_id
      WHERE f.id = ?
    `).get(id) as Record<string, unknown> | undefined;
    return row ? positionFillFromRow(row) : null;
  }

  listPositionFills(filters: {
    walletId?: string;
    tokenId?: string;
    tokenAddress?: string;
    groupId?: string;
    status?: string;
    source?: string;
    limit?: number;
  } = {}): PositionFillRecord[] {
    const clauses: string[] = [];
    const params: SQLInputValue[] = [];
    if (filters.walletId) {
      clauses.push('f.wallet_id = ?');
      params.push(filters.walletId);
    }
    if (filters.tokenId) {
      clauses.push('f.token_id = ?');
      params.push(filters.tokenId);
    }
    if (filters.tokenAddress) {
      clauses.push('lower(f.token_address) = lower(?)');
      params.push(filters.tokenAddress);
    }
    if (filters.groupId) {
      clauses.push('f.group_id = ?');
      params.push(filters.groupId);
    }
    if (filters.status) {
      clauses.push('f.status = ?');
      params.push(filters.status);
    }
    if (filters.source) {
      clauses.push('f.source = ?');
      params.push(filters.source);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    params.push(Math.min(Math.max(filters.limit ?? 300, 1), 5000));
    const rows = this.db.prepare(`
      SELECT
        f.*,
        w.address AS wallet_address,
        w.label AS wallet_label,
        t.name AS token_name,
        g.name AS group_name
      FROM position_fills f
      JOIN wallets w ON w.id = f.wallet_id
      LEFT JOIN terminal_tokens t ON t.id = f.token_id
      LEFT JOIN groups g ON g.id = f.group_id
      ${where}
      ORDER BY f.created_at DESC
      LIMIT ?
    `).all(...params) as Record<string, unknown>[];
    return rows.map(positionFillFromRow);
  }

  insertPositionLot(input: {
    walletId: string;
    tokenId?: string | null;
    tokenAddress: string;
    tokenSymbol: string;
    sourceFillId: string;
    openedQuantityTokens: string;
    openQuantityTokens: string;
    costBasisUsd: number;
  }): PositionLotRecord {
    const id = `lot_${randomUUID()}`;
    const time = nowIso();
    this.db.prepare(`
      INSERT INTO position_lots (
        id, wallet_id, token_id, token_address, token_symbol, status, source_fill_id,
        opened_quantity_tokens, open_quantity_tokens, cost_basis_usd, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.walletId,
      input.tokenId ?? null,
      input.tokenAddress,
      input.tokenSymbol,
      input.sourceFillId,
      input.openedQuantityTokens,
      input.openQuantityTokens,
      input.costBasisUsd,
      time,
      time
    );
    const created = this.positionLotById(id);
    if (!created) throw new Error('position_lot_create_failed');
    return created;
  }

  positionLotById(id: string): PositionLotRecord | null {
    const row = this.db.prepare(`
      SELECT
        l.*,
        w.address AS wallet_address,
        w.label AS wallet_label
      FROM position_lots l
      JOIN wallets w ON w.id = l.wallet_id
      WHERE l.id = ?
    `).get(id) as Record<string, unknown> | undefined;
    return row ? positionLotFromRow(row) : null;
  }

  positionLotBySourceFillId(sourceFillId: string): PositionLotRecord | null {
    const row = this.db.prepare(`
      SELECT
        l.*,
        w.address AS wallet_address,
        w.label AS wallet_label
      FROM position_lots l
      JOIN wallets w ON w.id = l.wallet_id
      WHERE l.source_fill_id = ?
      ORDER BY l.created_at ASC
      LIMIT 1
    `).get(sourceFillId) as Record<string, unknown> | undefined;
    return row ? positionLotFromRow(row) : null;
  }

  listOpenPositionLots(walletId: string, tokenAddress: string): PositionLotRecord[] {
    const rows = this.db.prepare(`
      SELECT
        l.*,
        w.address AS wallet_address,
        w.label AS wallet_label
      FROM position_lots l
      JOIN wallets w ON w.id = l.wallet_id
      WHERE l.wallet_id = ?
        AND lower(l.token_address) = lower(?)
        AND l.status = 'open'
        AND CAST(l.open_quantity_tokens AS REAL) > 0
      ORDER BY l.created_at ASC
    `).all(walletId, tokenAddress) as Record<string, unknown>[];
    return rows.map(positionLotFromRow);
  }

  updatePositionLot(id: string, input: {
    openedQuantityTokens?: string;
    openQuantityTokens: string;
    costBasisUsd: number;
    status?: PositionLotRecord['status'];
  }): PositionLotRecord {
    this.db.prepare(`
      UPDATE position_lots
      SET opened_quantity_tokens = ?,
          open_quantity_tokens = ?,
          cost_basis_usd = ?,
          status = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      input.openedQuantityTokens ?? this.positionLotById(id)?.openedQuantityTokens ?? input.openQuantityTokens,
      input.openQuantityTokens,
      input.costBasisUsd,
      input.status ?? 'open',
      nowIso(),
      id
    );
    const updated = this.positionLotById(id);
    if (!updated) throw new Error('position_lot_not_found');
    return updated;
  }

  walletTokenCostBasisUsd(walletId: string, tokenAddress: string): number | null {
    const lots = this.db.prepare(`
      SELECT COALESCE(SUM(cost_basis_usd), 0) AS total
      FROM position_lots
      WHERE wallet_id = ?
        AND lower(token_address) = lower(?)
        AND status = 'open'
        AND CAST(open_quantity_tokens AS REAL) > 0
    `).get(walletId, tokenAddress) as { total?: number } | undefined;
    const pending = this.db.prepare(`
      SELECT COALESCE(SUM(value_usd), 0) AS total
      FROM position_fills
      WHERE wallet_id = ?
        AND lower(token_address) = lower(?)
        AND side = 'buy'
        AND status <> 'cancelled'
        AND quantity_tokens IS NULL
    `).get(walletId, tokenAddress) as { total?: number } | undefined;
    const total = Number(lots?.total ?? 0) + Number(pending?.total ?? 0);
    return total > 0 ? total : null;
  }

  refreshTerminalTokenAccounting(tokenId: string): TerminalTokenRecord | null {
    const fillTotals = this.db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN side = 'buy' THEN value_usd ELSE 0 END), 0) AS invested,
        COALESCE(SUM(CASE WHEN side = 'sell' THEN value_usd ELSE 0 END), 0) AS sold,
        COALESCE(SUM(CASE WHEN side = 'sell' THEN realized_pnl_usd ELSE 0 END), 0) AS realized
      FROM position_fills
      WHERE token_id = ? AND status <> 'cancelled'
    `).get(tokenId) as { invested?: number; sold?: number; realized?: number } | undefined;
    const lotTotals = this.db.prepare(`
      SELECT COALESCE(SUM(CAST(open_quantity_tokens AS REAL)), 0) AS holdings
      FROM position_lots
      WHERE token_id = ? AND status = 'open'
    `).get(tokenId) as { holdings?: number } | undefined;
    this.db.prepare(`
      UPDATE terminal_tokens
      SET total_holdings = ?,
          total_invested_usd = ?,
          total_sold_usd = ?,
          realized_pnl_usd = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      String(Number(lotTotals?.holdings ?? 0)),
      Number(fillTotals?.invested ?? 0),
      Number(fillTotals?.sold ?? 0),
      Number(fillTotals?.realized ?? 0),
      nowIso(),
      tokenId
    );
    return this.terminalTokenById(tokenId);
  }

  listPositionSummaries(filters: {
    walletId?: string;
    tokenId?: string;
    tokenAddress?: string;
    groupId?: string;
    primeOnly?: boolean;
    limit?: number;
  } = {}): PositionSummaryRecord[] {
    const tokenAddress = filters.tokenAddress
      ?? (filters.tokenId ? this.terminalTokenById(filters.tokenId)?.tokenAddress ?? undefined : undefined);
    const fills = this.listPositionFills({
      walletId: filters.walletId,
      tokenId: filters.tokenId,
      tokenAddress,
      groupId: filters.groupId,
      limit: 5000
    }).filter((fill) => fill.status !== 'cancelled');
    const positions = this.listWalletTokenPositions({
      walletId: filters.walletId,
      groupId: filters.groupId,
      tokenAddress
    });
    const lots = this.listPositionLots({
      walletId: filters.walletId,
      tokenId: filters.tokenId,
      tokenAddress,
      status: 'open'
    });
    const summaries = new Map<string, PositionSummaryRecord>();
    const ensure = (seed: {
      walletId: string;
      walletAddress?: string;
      walletLabel?: string;
      tokenId?: string | null;
      tokenName?: string | null;
      tokenAddress: string;
      tokenSymbol: string;
      groupId?: string | null;
      groupName?: string | null;
      campaignName?: string | null;
    }) => {
      const key = `${seed.walletId}:${seed.tokenAddress.toLowerCase()}`;
      const existing = summaries.get(key);
      if (existing) return existing;
      const wallet = this.walletById(seed.walletId);
      const group = seed.groupId ? this.groupById(seed.groupId) : wallet?.activeGroupId ? this.groupById(wallet.activeGroupId) : null;
      const summary: PositionSummaryRecord = {
        walletId: seed.walletId,
        walletAddress: seed.walletAddress ?? wallet?.address ?? '',
        walletLabel: seed.walletLabel ?? wallet?.label ?? '',
        primeRank: wallet?.primeRank ?? null,
        devRank: wallet?.devRank ?? null,
        groupId: seed.groupId ?? group?.id ?? null,
        groupName: seed.groupName ?? group?.name ?? null,
        campaignName: seed.campaignName ?? group?.campaignName ?? null,
        tokenId: seed.tokenId ?? null,
        tokenName: seed.tokenName ?? null,
        tokenAddress: seed.tokenAddress,
        tokenSymbol: seed.tokenSymbol,
        buyCount: 0,
        sellCount: 0,
        investedUsd: 0,
        soldUsd: 0,
        realizedPnlUsd: 0,
        openQuantityTokens: null,
        openCostBasisUsd: 0,
        pendingCostUsd: 0,
        currentBalance: null,
        currentUsdValue: null,
        unrealizedPnlUsd: null,
        totalPnlUsd: null,
        avgEntryPriceUsd: null,
        updatedAt: nowIso()
      };
      summaries.set(key, summary);
      return summary;
    };

    for (const fill of fills) {
      const summary = ensure(fill);
      if (fill.side === 'buy') {
        summary.buyCount += 1;
        summary.investedUsd += fill.valueUsd ?? 0;
        if (!fill.quantityTokens) summary.pendingCostUsd += fill.valueUsd ?? 0;
      } else {
        summary.sellCount += 1;
        summary.soldUsd += fill.valueUsd ?? 0;
        summary.realizedPnlUsd += fill.realizedPnlUsd ?? 0;
      }
      summary.updatedAt = fill.createdAt > summary.updatedAt ? fill.createdAt : summary.updatedAt;
    }

    for (const lot of lots) {
      const summary = ensure(lot);
      const currentOpen = Number(summary.openQuantityTokens ?? '0');
      const lotOpen = Number(lot.openQuantityTokens || 0);
      summary.openQuantityTokens = String(currentOpen + lotOpen);
      summary.openCostBasisUsd += lot.costBasisUsd;
      summary.updatedAt = lot.updatedAt > summary.updatedAt ? lot.updatedAt : summary.updatedAt;
    }

    for (const position of positions) {
      const summary = ensure({
        walletId: position.walletId,
        walletAddress: position.walletAddress,
        walletLabel: position.walletLabel,
        tokenAddress: position.tokenAddress,
        tokenSymbol: position.tokenSymbol,
        groupId: position.groupId,
        groupName: position.groupName,
        campaignName: position.campaignName
      });
      summary.currentBalance = position.tokenBalance;
      summary.currentUsdValue = position.tokenUsdValue;
      summary.updatedAt = position.updatedAt > summary.updatedAt ? position.updatedAt : summary.updatedAt;
    }

    const rows = [...summaries.values()]
      .filter((summary) => !filters.primeOnly || summary.primeRank !== null)
      .map((summary) => {
        const openQty = Number(summary.openQuantityTokens ?? '0');
        const basis = summary.openCostBasisUsd + summary.pendingCostUsd;
        summary.avgEntryPriceUsd = openQty > 0 ? summary.openCostBasisUsd / openQty : null;
        summary.unrealizedPnlUsd = summary.currentUsdValue !== null ? summary.currentUsdValue - basis : null;
        summary.totalPnlUsd = summary.unrealizedPnlUsd !== null ? summary.realizedPnlUsd + summary.unrealizedPnlUsd : summary.realizedPnlUsd;
        return summary;
      })
      .sort((a, b) => {
        const aPrime = a.primeRank ?? 999;
        const bPrime = b.primeRank ?? 999;
        if (aPrime !== bPrime) return aPrime - bPrime;
        return (b.totalPnlUsd ?? Number.NEGATIVE_INFINITY) - (a.totalPnlUsd ?? Number.NEGATIVE_INFINITY);
      });
    return rows.slice(0, Math.min(Math.max(filters.limit ?? 300, 1), 1000));
  }

  listPositionLots(filters: {
    walletId?: string;
    tokenId?: string;
    tokenAddress?: string;
    status?: string;
  } = {}): PositionLotRecord[] {
    const clauses: string[] = [];
    const params: SQLInputValue[] = [];
    if (filters.walletId) {
      clauses.push('l.wallet_id = ?');
      params.push(filters.walletId);
    }
    if (filters.tokenId) {
      clauses.push('l.token_id = ?');
      params.push(filters.tokenId);
    }
    if (filters.tokenAddress) {
      clauses.push('lower(l.token_address) = lower(?)');
      params.push(filters.tokenAddress);
    }
    if (filters.status) {
      clauses.push('l.status = ?');
      params.push(filters.status);
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.db.prepare(`
      SELECT
        l.*,
        w.address AS wallet_address,
        w.label AS wallet_label
      FROM position_lots l
      JOIN wallets w ON w.id = l.wallet_id
      ${where}
      ORDER BY l.created_at ASC
    `).all(...params) as Record<string, unknown>[];
    return rows.map(positionLotFromRow);
  }

  selectAvailableWallets(input: { count: number; tags?: string[]; minBalanceWei?: string }): WalletRecord[] {
    const clauses = ["status = 'available'", 'active_group_id IS NULL'];
    const params: SQLInputValue[] = [];
    for (const tag of input.tags ?? []) {
      clauses.push('tags LIKE ?');
      params.push(`%"${tag}"%`);
    }
    if (input.minBalanceWei) {
      clauses.push('(length(balance_wei) > length(?) OR (length(balance_wei) = length(?) AND balance_wei >= ?))');
      params.push(input.minBalanceWei, input.minBalanceWei, input.minBalanceWei);
    }
    params.push(input.count);
    const rows = this.db.prepare(`
      SELECT * FROM wallets
      WHERE ${clauses.join(' AND ')}
      ORDER BY length(balance_wei) DESC, balance_wei DESC, use_count ASC, created_at ASC
      LIMIT ?
    `).all(...params) as Record<string, unknown>[];
    return rows.map(walletFromRow);
  }

  updateWalletBalance(address: string, balanceWei: string): void {
    this.db.prepare(`
      UPDATE wallets
      SET balance_wei = ?, balance_bnb = ?, updated_at = ?
      WHERE lower(address) = lower(?)
    `).run(balanceWei, formatEther(BigInt(balanceWei)), nowIso(), address);
  }

  createGroup(input: {
    id: string;
    name: string;
    campaignName?: string | null;
    tokenAddress?: string | null;
    fourMemeTokenId?: string | null;
    fourMemeStatus?: string | null;
    tags?: string[];
  }): GroupRecord {
    const time = nowIso();
    this.db.prepare(`
      INSERT INTO groups (
        id, name, campaign_name, token_address, four_meme_token_id,
        four_meme_status, tags, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `).run(
      input.id,
      input.name,
      input.campaignName ?? null,
      input.tokenAddress ?? null,
      input.fourMemeTokenId ?? null,
      input.fourMemeStatus ?? null,
      JSON.stringify(input.tags ?? []),
      time,
      time
    );
    const created = this.groupById(input.id);
    if (!created) throw new Error('group_create_failed');
    return created;
  }

  groupById(id: string): GroupRecord | null {
    const row = this.db.prepare('SELECT * FROM groups WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!row) return null;
    const wallets = this.listWallets({ groupId: id });
    const total = wallets.reduce((sum, wallet) => sum + BigInt(wallet.balanceWei), 0n);
    return groupFromRow({ ...row, wallet_count: wallets.length, total_balance_wei: total.toString() });
  }

  listGroups(): GroupRecord[] {
    const rows = this.db.prepare('SELECT * FROM groups ORDER BY created_at DESC').all() as Record<string, unknown>[];
    return rows.map((row) => {
      const id = String(row.id);
      const wallets = this.listWallets({ groupId: id });
      const total = wallets.reduce((sum, wallet) => sum + BigInt(wallet.balanceWei), 0n);
      return groupFromRow({ ...row, wallet_count: wallets.length, total_balance_wei: total.toString() });
    });
  }

  reserveWallets(groupId: string, walletIds: string[]): WalletRecord[] {
    const time = nowIso();
    const group = this.groupById(groupId);
    this.db.exec('BEGIN');
    try {
      for (const walletId of walletIds) {
        this.db.prepare(`
          INSERT INTO group_wallets (group_id, wallet_id, reserved_at, released_at)
          VALUES (?, ?, ?, NULL)
        `).run(groupId, walletId, time);
        this.db.prepare(`
          UPDATE wallets
          SET status = 'reserved',
              active_group_id = ?,
              use_count = use_count + 1,
              last_used_at = ?,
              updated_at = ?
          WHERE id = ? AND status = 'available' AND active_group_id IS NULL
        `).run(groupId, time, time, walletId);
        this.addWalletHistory({
          walletId,
          type: 'wallet_reserved',
          groupId,
          campaignName: group?.campaignName ?? null,
          tokenAddress: group?.tokenAddress ?? null,
          status: 'confirmed',
          metadata: { groupName: group?.name ?? null }
        });
      }
      this.db.prepare('UPDATE groups SET updated_at = ? WHERE id = ?').run(time, groupId);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return this.listWallets({ groupId });
  }

  releaseWallets(groupId: string, walletIds?: string[]): number {
    const time = nowIso();
    const group = this.groupById(groupId);
    const activeWallets = this.listWallets({ groupId }).filter((wallet) => !walletIds || walletIds.includes(wallet.id));
    this.db.exec('BEGIN');
    try {
      for (const walletId of activeWallets.map((wallet) => wallet.id)) {
        this.db.prepare(`
          UPDATE group_wallets
          SET released_at = ?
          WHERE group_id = ? AND wallet_id = ? AND released_at IS NULL
        `).run(time, groupId, walletId);
        this.db.prepare(`
          UPDATE wallets
          SET status = 'available', active_group_id = NULL, updated_at = ?
          WHERE id = ? AND active_group_id = ?
        `).run(time, walletId, groupId);
        this.addWalletHistory({
          walletId,
          type: 'wallet_released',
          groupId,
          campaignName: group?.campaignName ?? null,
          tokenAddress: group?.tokenAddress ?? null,
          status: 'confirmed',
          metadata: { groupName: group?.name ?? null }
        });
      }
      this.db.prepare('UPDATE groups SET updated_at = ? WHERE id = ?').run(time, groupId);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return activeWallets.length;
  }
}
