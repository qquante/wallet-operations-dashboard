export type WalletStatus = 'available' | 'reserved' | 'archived';
export type GroupStatus = 'active' | 'archived';
export type TerminalCampaignStatus = 'active' | 'archived';
export type TerminalTokenStatus = 'draft' | 'pre_launch' | 'live' | 'archived';
export type TerminalTaskKind =
  | 'four_meme_create'
  | 'first_buy'
  | 'sell_prime'
  | 'bulk_sell'
  | 'volume'
  | 'bump'
  | 'sell_buyback'
  | 'fund'
  | 'withdraw'
  | 'collect_fees'
  | 'warm';
export type TerminalTaskStatus = 'queued' | 'dry_run_ready' | 'cancelled' | 'done' | 'failed';
export type TerminalAutomationStatus = 'active' | 'paused' | 'archived';
export type TerminalTriggerType = 'manual' | 'delay' | 'market_cap' | 'profit' | 'price' | 'bonding_curve';
export type BlueprintStatus = 'active' | 'archived';
export type PositionFillSide = 'buy' | 'sell';
export type PositionFillStatus = 'planned' | 'simulated' | 'confirmed' | 'cancelled';
export type PositionFillSource = 'launch_dry_run' | 'task_dry_run' | 'manual' | 'onchain' | 'imported';
export type PositionLotStatus = 'open' | 'closed' | 'cancelled';
export type ExecutionPlanStatus = 'saved' | 'reviewed' | 'archived';
export type ExecutionPlanConfirmationStatus = 'rejected' | 'blocked';

export interface WalletRecord {
  id: string;
  address: string;
  label: string;
  tags: string[];
  source: 'generated' | 'imported' | 'watch_only';
  status: WalletStatus;
  balanceWei: string;
  balanceBNB: string;
  primeRank: number | null;
  devRank: number | null;
  devRole: string | null;
  devNotes: string | null;
  useCount: number;
  lastUsedAt: string | null;
  activeGroupId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GroupRecord {
  id: string;
  name: string;
  campaignName: string | null;
  tokenAddress: string | null;
  fourMemeTokenId: string | null;
  fourMemeStatus: string | null;
  tags: string[];
  status: GroupStatus;
  walletCount: number;
  totalBalanceWei: string;
  totalBalanceBNB: string;
  createdAt: string;
  updatedAt: string;
}

export interface TerminalCampaignRecord {
  id: string;
  name: string;
  status: TerminalCampaignStatus;
  groupIds: string[];
  devWalletIds: string[];
  tags: string[];
  metadata: Record<string, unknown>;
  tokenCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TerminalTokenRecord {
  id: string;
  name: string;
  symbol: string;
  tokenAddress: string | null;
  launchpad: string;
  chainId: number;
  status: TerminalTokenStatus;
  campaignId: string | null;
  campaignName: string | null;
  groupId: string | null;
  groupName: string | null;
  devWalletId: string | null;
  devWalletLabel: string | null;
  devWalletAddress: string | null;
  launchDraftId: string | null;
  imageUrl: string | null;
  marketCapUsd: number | null;
  tokenPriceUsd: number | null;
  totalHoldings: string | null;
  totalInvestedUsd: number | null;
  totalSoldUsd: number | null;
  realizedPnlUsd: number | null;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface TerminalTaskRecord {
  id: string;
  tokenId: string | null;
  tokenName: string | null;
  tokenSymbol: string | null;
  name: string;
  kind: TerminalTaskKind;
  status: TerminalTaskStatus;
  triggerType: TerminalTriggerType;
  triggerValue: string | null;
  walletIds: string[];
  groupId: string | null;
  groupName: string | null;
  params: Record<string, unknown>;
  dryRunPlan: Record<string, unknown>;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TerminalAutomationRecord {
  id: string;
  tokenId: string | null;
  tokenName: string | null;
  tokenSymbol: string | null;
  name: string;
  status: TerminalAutomationStatus;
  triggerType: TerminalTriggerType;
  triggerValue: string | null;
  taskIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface BlueprintRecord {
  id: string;
  name: string;
  description: string | null;
  walletSlots: Array<Record<string, unknown>>;
  taskTemplates: Array<Record<string, unknown>>;
  settings: Record<string, unknown>;
  status: BlueprintStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AppSettingRecord {
  key: string;
  value: string;
  updatedAt: string;
}

export interface TokenPriceSnapshotRecord {
  id: string;
  tokenAddress: string;
  priceUsd: number | null;
  source: string;
  marketCapUsd: number | null;
  progress: number | null;
  fourMemeStatus: string | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface BnbPriceSnapshotRecord {
  id: string;
  symbol: 'BNBUSDT';
  priceUsd: number;
  source: string;
  interval: string;
  openTimeMs: number;
  closeTimeMs: number;
  openUsd: number;
  highUsd: number;
  lowUsd: number;
  closeUsd: number;
  volume: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface PositionFillRecord {
  id: string;
  walletId: string;
  walletAddress: string;
  walletLabel: string;
  tokenId: string | null;
  tokenName: string | null;
  tokenAddress: string;
  tokenSymbol: string;
  side: PositionFillSide;
  status: PositionFillStatus;
  source: PositionFillSource;
  quantityRaw: string | null;
  quantityTokens: string | null;
  tokenDecimals: number;
  priceUsd: number | null;
  valueUsd: number | null;
  costBasisUsd: number | null;
  realizedPnlUsd: number | null;
  bnbAmountWei: string | null;
  bnbAmount: string | null;
  bnbPriceUsd: number | null;
  txHash: string | null;
  groupId: string | null;
  groupName: string | null;
  campaignName: string | null;
  launchDraftId: string | null;
  taskId: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface PositionLotRecord {
  id: string;
  walletId: string;
  walletAddress: string;
  walletLabel: string;
  tokenId: string | null;
  tokenAddress: string;
  tokenSymbol: string;
  status: PositionLotStatus;
  sourceFillId: string;
  openedQuantityTokens: string;
  openQuantityTokens: string;
  costBasisUsd: number;
  createdAt: string;
  updatedAt: string;
}

export interface PositionSummaryRecord {
  walletId: string;
  walletAddress: string;
  walletLabel: string;
  primeRank: number | null;
  devRank: number | null;
  groupId: string | null;
  groupName: string | null;
  campaignName: string | null;
  tokenId: string | null;
  tokenName: string | null;
  tokenAddress: string;
  tokenSymbol: string;
  buyCount: number;
  sellCount: number;
  investedUsd: number;
  soldUsd: number;
  realizedPnlUsd: number;
  openQuantityTokens: string | null;
  openCostBasisUsd: number;
  pendingCostUsd: number;
  currentBalance: string | null;
  currentUsdValue: number | null;
  unrealizedPnlUsd: number | null;
  totalPnlUsd: number | null;
  avgEntryPriceUsd: number | null;
  updatedAt: string;
}

export interface ExecutionPlanRecord {
  id: string;
  version: string;
  planHash: string;
  tokenAddress: string;
  side: 'buy' | 'sell';
  status: ExecutionPlanStatus;
  request: Record<string, unknown>;
  plan: Record<string, unknown>;
  latestReview: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ExecutionPlanConfirmationRecord {
  id: string;
  planId: string;
  status: ExecutionPlanConfirmationStatus;
  requiredPhrase: string;
  phraseAccepted: boolean;
  operatorNote: string | null;
  checks: Record<string, unknown>;
  createdAt: string;
}

export interface AuditEvent {
  id: string;
  type: string;
  severity: 'info' | 'warn' | 'error';
  message: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface WalletHistoryRecord {
  id: string;
  walletId: string;
  walletAddress: string;
  walletLabel: string;
  type: string;
  groupId: string | null;
  groupName: string | null;
  tokenAddress: string | null;
  tokenSymbol: string | null;
  campaignName: string | null;
  amountWei: string | null;
  amountBNB: string | null;
  status: string;
  notes: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface WalletTokenPositionRecord {
  walletId: string;
  walletAddress: string;
  walletLabel: string;
  groupId: string | null;
  groupName: string | null;
  campaignName: string | null;
  tokenAddress: string;
  tokenSymbol: string;
  tokenDecimals: number;
  tokenBalanceRaw: string;
  tokenBalance: string;
  tokenUsdValue: number | null;
  plannedCostUsd: number | null;
  pnlUsd: number | null;
  firstSeenAt: string;
  updatedAt: string;
}

export interface LaunchDraftRecord {
  id: string;
  campaignName: string | null;
  groupIds: string[];
  devWalletId: string | null;
  devWalletLabel: string | null;
  devWalletAddress: string | null;
  tokenAddress: string | null;
  name: string;
  shortName: string;
  description: string;
  imgUrl: string;
  imageFilePath: string | null;
  label: string;
  webUrl: string;
  twitterUrl: string;
  telegramUrl: string;
  raisedSymbol: string;
  raisedTokenAddress: string;
  raisedTokenSnapshot: Record<string, unknown>;
  preSale: string;
  onlyMPC: boolean;
  feePlan: boolean;
  status: string;
  controls: Record<string, unknown>;
  triggers: Array<Record<string, unknown>>;
  createBodyPreview: Record<string, unknown>;
  createDryRunPlan: Record<string, unknown>;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BscNodeInfo {
  endpoint: string;
  chainId: number;
  ws_url: string | null;
  http_url: string | null;
  ws_subscribe: boolean;
  healthy: boolean;
  lag: number | null;
  latency_ms?: {
    p50?: number;
  };
}
