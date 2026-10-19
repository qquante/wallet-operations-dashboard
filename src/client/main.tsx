import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Archive,
  Copy,
  Crown,
  Download,
  Eye,
  History,
  KeyRound,
  PackageSearch,
  Plus,
  RefreshCw,
  Rocket,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Tags,
  TrendingUp,
  Users,
  WalletCards
} from 'lucide-react';
import './styles.css';

interface WalletRecord {
  id: string;
  address: string;
  label: string;
  tags: string[];
  source: string;
  status: string;
  balanceWei: string;
  balanceBNB: string;
  primeRank: number | null;
  devRank: number | null;
  devRole: string | null;
  devNotes: string | null;
  useCount: number;
  activeGroupId: string | null;
  createdAt: string;
}

interface GroupRecord {
  id: string;
  name: string;
  campaignName: string | null;
  tokenAddress: string | null;
  tags: string[];
  status: string;
  walletCount: number;
  totalBalanceBNB: string;
}

interface AuditEvent {
  id: string;
  type: string;
  severity: 'info' | 'warn' | 'error';
  message: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

interface WalletHistoryRecord {
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
  amountBNB: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
}

interface WalletTokenPositionRecord {
  walletId: string;
  walletAddress: string;
  walletLabel: string;
  groupId: string | null;
  groupName: string | null;
  campaignName: string | null;
  tokenAddress: string;
  tokenSymbol: string;
  tokenBalance: string;
  tokenUsdValue: number | null;
  plannedCostUsd: number | null;
  pnlUsd: number | null;
  updatedAt: string;
}

interface HealthStatus {
  ok: boolean;
  chainId: number;
  storageMode: string;
  legacyEncryptedKeys: number;
}

interface BnbPlan {
  dryRunOnly: true;
  node: string;
  gasPriceWei: string;
  estimatedGasCostWei: string;
  transfers: Array<{
    fromAddress: string;
    toAddress: string;
    valueBNB: string;
    currentBalanceBNB: string;
    canAfford: boolean;
    reason: string | null;
  }>;
}

interface BnbMarketPrice {
  symbol: 'BNBUSDT';
  priceUsd: number;
  source: 'binance_spot';
  updatedAt: string;
}

type LaunchAmountMode = 'fixed' | 'random_range' | 'percent_balance' | 'per_wallet';

interface LaunchDryRunQueue {
  dryRunOnly: true;
  chainId: 56;
  groupIds: string[];
  groups: Array<{ id: string; name: string }>;
  devWallet: {
    walletId: string;
    label: string;
    address: string;
    devRank: number | null;
    devRole: string | null;
  } | null;
  tokenAddress: string;
  campaignName: string | null;
  amountMode: LaunchAmountMode;
  bnbPriceUsd: number | null;
  totalPlannedBnb: string;
  totalPlannedUsd: number | null;
  queue: Array<{
    index: number;
    groupId: string;
    groupName: string;
    groupAlias: string;
    walletId: string;
    walletLabel: string;
    primeRank: number | null;
    address: string;
    tags: string[];
    amountMode: LaunchAmountMode;
    amountBNB: string;
    plannedCostUsd: number | null;
    currentBalanceBNB: string;
    canAfford: boolean;
    status: 'queued_dry_run' | 'insufficient_bnb' | 'zero_amount';
    reason: string | null;
  }>;
  note: string;
}

interface FourMemeConfigSnapshot {
  updatedAt: string;
  published: Array<{
    symbol: string;
    nativeSymbol: string;
    symbolAddress: string;
    totalBAmount: string;
    b0Amount: string;
    saleRate: string;
    buyFee: string;
    sellFee: string;
    status: string;
  }>;
}

interface FourMemeLaunchDraft {
  dryRunOnly: true;
  readyForApiPrepare: false;
  token: {
    name: string;
    shortName: string;
    desc: string;
    imgUrl: string;
    label: string;
    webUrl: string;
    twitterUrl: string;
    telegramUrl: string;
    launchTime: number;
  };
  options: {
    raisedSymbol: string;
    preSale: string;
    onlyMPC: boolean;
    feePlan: boolean;
  };
  raisedToken: FourMemeConfigSnapshot['published'][number];
  createBodyPreview: Record<string, unknown>;
  note: string;
}

interface LaunchDraftRecord {
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

interface FourMemeCreateDryRunPlan {
  dryRunOnly: true;
  draftId: string;
  status: string;
  chainId: 56;
  factoryAddress: string;
  apiBase: string;
  endpoints: Record<string, string>;
  devWallet: {
    walletId: string;
    label: string;
    address: string;
    devRank: number | null;
    devRole: string | null;
  } | null;
  auth: Record<string, unknown>;
  imageUpload: Record<string, unknown>;
  createApi: Record<string, unknown>;
  factoryTx: Record<string, unknown>;
  controls: Record<string, unknown>;
  triggers: Array<Record<string, unknown>>;
  note: string;
}

interface TokenBagSnapshot {
  chainId: 56;
  node: string;
  tokenAddress: string;
  tokenSymbol: string;
  tokenDecimals: number;
  tokenPriceUsd: number | null;
  tokenPriceSource: string;
  tokenMarketCapUsd: number | null;
  tokenProgress: number | null;
  tokenLifecycleStatus: string | null;
  tokenPriceUpdatedAt: string | null;
  totalTokenBalance: string;
  totalUsdValue: number | null;
  totalPlannedCostUsd: number | null;
  totalPnlUsd: number | null;
  rows: Array<{
    walletId: string;
    walletLabel: string;
    address: string;
    primeRank: number | null;
    tokenBalanceRaw: string;
    tokenBalance: string;
    tokenUsdValue: number | null;
    plannedCostUsd: number | null;
    pnlUsd: number | null;
    bnbBalance: string;
  }>;
}

interface PositionSummaryRecord {
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

interface PositionFillRecord {
  id: string;
  walletId: string;
  walletAddress: string;
  walletLabel: string;
  tokenAddress: string;
  tokenSymbol: string;
  side: 'buy' | 'sell';
  status: string;
  source: string;
  quantityTokens: string | null;
  valueUsd: number | null;
  costBasisUsd?: number | null;
  realizedPnlUsd: number | null;
  bnbAmount: string | null;
  txHash?: string | null;
  groupId: string | null;
  campaignName: string | null;
  createdAt: string;
}

interface TxPreview {
  readOnly: true;
  chainId: 56;
  txHash: string;
  status: 'success' | 'failed' | 'unknown';
  blockNumber: number;
  from: string;
  to: string | null;
  nativeValueBNB: string;
  gasCostBNB: string | null;
  bnbPrice: {
    priceUsd: number;
    source: string;
    historical: boolean;
    timestamp: number | null;
    openTimeMs: number | null;
    closeTimeMs: number | null;
  } | null;
  explorer: {
    enabled: boolean;
    source: string;
    internalTxs: number;
    tokenTransfers: number;
    warnings: string[];
  };
  suggestion: {
    side: 'buy' | 'sell' | null;
    tokenAddress: string | null;
    tokenSymbol: string | null;
    tokenDecimals: number | null;
    quantityRaw: string | null;
    quantityTokens: string | null;
    bnbAmount: string | null;
    valueUsd: number | null;
    priceUsd: number | null;
    confidence: 'high' | 'medium' | 'low';
    reason: string;
  };
  warnings: string[];
}

interface FourMemeTradeDryRun {
  readOnly: true;
  broadcast: false;
  tokenAddress: string;
  side: 'buy' | 'sell';
  buyMode: 'funds' | 'amount' | null;
  node: string;
  walletAddress: string | null;
  tokenInfo: {
    version: number;
    tokenManager: string;
    quote: string | null;
    liquidityAdded: boolean;
  };
  quote: Record<string, unknown>;
  tx: {
    to: string;
    functionName: string;
    calldata: string;
    valueWei: string;
    valueBNB: string;
    approvalToken: string | null;
    approvalSpender: string | null;
    approvalAmountWei: string | null;
  };
  simulation: {
    estimateGas: string | null;
    callSuccess: boolean | null;
    callResult: string | null;
    errors: string[];
  };
  market: {
    tokenPriceUsd: number | null;
    tokenPriceSource: string | null;
    lifecyclePhase: string | null;
    bnbPriceUsd: number | null;
    estimatedValueUsd: number | null;
  };
  warnings: string[];
}

interface FourMemeExecutionPlan {
  readOnly: true;
  broadcast: false;
  blockedForBroadcast: true;
  blockReason: string;
  chainId: 56;
  tokenAddress: string;
  side: 'buy' | 'sell';
  request: Record<string, unknown>;
  node: string;
  walletCount: number;
  rows: Array<{
    index: number;
    walletId: string;
    walletLabel: string;
    walletAddress: string;
    primeRank: number | null;
    slippageBps: number;
    nonceBase: number;
    approvalNonce: number | null;
    tradeNonce: number;
    approval: {
      required: boolean;
      gasUnits: string | null;
      error: string | null;
    };
    trade: FourMemeTradeDryRun;
    gas: {
      gasPriceWei: string | null;
      totalGasUnits: string | null;
      totalGasCostBNB: string | null;
    };
    requiredNativeBNB: string;
    walletBalanceBNB: string;
    status: string;
    warnings: string[];
  }>;
  totals: {
    tradeValueWei: string;
    tradeValueBNB: string;
    gasCostWei: string | null;
    gasCostBNB: string | null;
    requiredNativeWei: string;
    requiredNativeBNB: string;
    ready: number;
    insufficientBnb: number;
    simulationErrors: number;
    gasUnknown: number;
  };
  warnings: string[];
  note: string;
}

interface ExecutionPlanRecord {
  id: string;
  version: string;
  planHash: string;
  tokenAddress: string;
  side: 'buy' | 'sell';
  status: string;
  request: Record<string, unknown>;
  plan: Record<string, unknown>;
  latestReview: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface ExecutionPlanReview {
  id: string;
  savedHash: string;
  liveHash: string;
  changed: boolean;
  reviewedAt: string;
  broadcast: false;
  blockedForBroadcast: true;
  blockReason: string;
  diff: Array<{
    path: string;
    before: unknown;
    after: unknown;
    severity: 'info' | 'warn' | 'error';
  }>;
  saved: ExecutionPlanRecord;
  livePlan: FourMemeExecutionPlan;
}

interface ExecutionPlanFinalConfirmation {
  planId: string;
  status: 'draft' | 'rejected' | 'blocked';
  requiredPhrase: string;
  phraseAccepted: boolean;
  realModeEnabled: false;
  broadcast: false;
  blockedForBroadcast: true;
  blockReason: string;
  readyForFutureRealMode: boolean;
  checks: Record<string, unknown>;
  blockingReasons: string[];
  confirmation: {
    id: string;
    status: string;
    phraseAccepted: boolean;
    createdAt: string;
  } | null;
  saved: ExecutionPlanRecord;
}

interface TerminalCampaignRecord {
  id: string;
  name: string;
  status: string;
  groupIds: string[];
  devWalletIds: string[];
  tags: string[];
  metadata: Record<string, unknown>;
  tokenCount: number;
  createdAt: string;
  updatedAt: string;
}

interface TerminalTokenRecord {
  id: string;
  name: string;
  symbol: string;
  tokenAddress: string | null;
  launchpad: string;
  chainId: number;
  status: string;
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

interface TerminalTaskRecord {
  id: string;
  tokenId: string | null;
  tokenName: string | null;
  tokenSymbol: string | null;
  name: string;
  kind: string;
  status: string;
  triggerType: string;
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

interface TerminalAutomationRecord {
  id: string;
  tokenId: string | null;
  tokenName: string | null;
  tokenSymbol: string | null;
  name: string;
  status: string;
  triggerType: string;
  triggerValue: string | null;
  taskIds: string[];
  createdAt: string;
  updatedAt: string;
}

interface BlueprintRecord {
  id: string;
  name: string;
  description: string | null;
  walletSlots: Array<Record<string, unknown>>;
  taskTemplates: Array<Record<string, unknown>>;
  settings: Record<string, unknown>;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface AppSettingRecord {
  key: string;
  value: string;
  updatedAt: string;
}

type AppTab = 'wallets' | 'groups' | 'dev' | 'tokens' | 'tasks' | 'automations' | 'blueprints' | 'settings' | 'launch' | 'bnb';

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options?.headers ?? {})
    }
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(data.error || response.statusText);
  }
  return response.json() as Promise<T>;
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function shortHash(hash: string): string {
  return hash ? `${hash.slice(0, 8)}...${hash.slice(-6)}` : 'n/a';
}

function numberFmt(value: string): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return value;
  return numeric.toLocaleString('en-US', { maximumFractionDigits: 6 });
}

function usdFmt(value: number): string {
  if (!Number.isFinite(value)) return '$0.00';
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

function parseJsonObject(text: string): Record<string, unknown> {
  const value = text.trim();
  if (!value) return {};
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('JSON precisa ser objeto');
  return parsed as Record<string, unknown>;
}

function parseJsonObjectArray(text: string): Array<Record<string, unknown>> {
  const value = text.trim();
  if (!value) return [];
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) throw new Error('JSON precisa ser array');
  return parsed.filter((item) => item && typeof item === 'object' && !Array.isArray(item)) as Array<Record<string, unknown>>;
}

function compactJson(value: unknown): string {
  return JSON.stringify(value ?? {}, null, 0);
}

function groupAlias(groupName: string, index: number): string {
  return `${groupName}-${String(index + 1).padStart(2, '0')}`;
}

function walletOptionText(wallet: WalletRecord): string {
  const markers = [
    wallet.devRank ? `D${wallet.devRank}` : '',
    wallet.primeRank ? `P${wallet.primeRank}` : '',
    wallet.tags.length ? `[${wallet.tags.slice(0, 3).join(',')}]` : ''
  ].filter(Boolean).join(' ');
  return `${markers ? `${markers} // ` : ''}${wallet.label} // ${shortAddress(wallet.address)} // ${wallet.status}`;
}

function App() {
  const [tab, setTab] = useState<AppTab>('wallets');
  const [health, setHealth] = useState<HealthStatus>({ ok: false, chainId: 56, storageMode: 'local_plaintext', legacyEncryptedKeys: 0 });
  const [wallets, setWallets] = useState<WalletRecord[]>([]);
  const [groups, setGroups] = useState<GroupRecord[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [bnbMarket, setBnbMarket] = useState<BnbMarketPrice | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [healthStatus, walletList, groupList, eventList, bnbPrice] = await Promise.all([
      api<HealthStatus>('/api/health'),
      api<WalletRecord[]>('/api/wallets'),
      api<GroupRecord[]>('/api/groups'),
      api<AuditEvent[]>('/api/events?limit=80'),
      api<BnbMarketPrice>('/api/market/bnb-price').catch(() => null)
    ]);
    setHealth(healthStatus);
    setWallets(walletList);
    setGroups(groupList);
    setEvents(eventList);
    setBnbMarket(bnbPrice);
  };

  useEffect(() => {
    void load().catch((err) => setError(err.message));
    const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/live`);
    socket.onmessage = (message) => {
      const payload = JSON.parse(message.data) as { event?: AuditEvent };
      if (payload.event) {
        setEvents((current) => [payload.event!, ...current].slice(0, 80));
        if (payload.event.type.includes('wallet') || payload.event.type.includes('group') || payload.event.type.includes('balance') || payload.event.type.includes('market') || payload.event.type.includes('terminal')) {
          void load().catch(() => undefined);
        }
      }
    };
    const timer = window.setInterval(() => void load().catch(() => undefined), 30_000);
    return () => {
      socket.close();
      window.clearInterval(timer);
    };
  }, []);

  const totalBNB = useMemo(
    () => wallets.reduce((sum, wallet) => sum + Number(wallet.balanceBNB || 0), 0),
    [wallets]
  );
  const available = wallets.filter((wallet) => wallet.status === 'available').length;
  const reserved = wallets.filter((wallet) => wallet.status === 'reserved').length;
  const totalUsd = totalBNB * (bnbMarket?.priceUsd ?? 0);

  const run = async (action: () => Promise<void>) => {
    setError('');
    setBusy(true);
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <h1>BUNE // WALLET_MATRIX</h1>
          <p>BSC local keys // groups // dry-run // 3x WS feed</p>
        </div>
        <div className="status-strip">
          <span className="pill ok"><ShieldCheck size={15} /> Local simples</span>
          <span className="pill">BNB {bnbMarket ? usdFmt(bnbMarket.priceUsd) : 'sync...'}</span>
          {health.legacyEncryptedKeys > 0 && <span className="pill warn">{health.legacyEncryptedKeys} keys antigas</span>}
          <span className="pill"><WalletCards size={15} /> {wallets.length} wallets</span>
          <span className="pill"><Users size={15} /> {groups.length} grupos</span>
        </div>
      </header>

      <section className="metrics">
        <div><strong>{wallets.length}</strong><span>wallets</span></div>
        <div><strong>{available}</strong><span>available</span></div>
        <div><strong>{reserved}</strong><span>reserved</span></div>
        <div><strong>{numberFmt(String(totalBNB))}</strong><span>BNB tracked</span></div>
        <div><strong>{usdFmt(totalUsd)}</strong><span>USD tracked</span></div>
      </section>

      {error && <div className="error">{error}</div>}

      <nav className="tabs">
        <button className={tab === 'wallets' ? 'active' : ''} onClick={() => setTab('wallets')}><WalletCards size={16} /> Wallets</button>
        <button className={tab === 'groups' ? 'active' : ''} onClick={() => setTab('groups')}><Users size={16} /> Grupos</button>
        <button className={tab === 'dev' ? 'active' : ''} onClick={() => setTab('dev')}><KeyRound size={16} /> DEV</button>
        <button className={tab === 'tokens' ? 'active' : ''} onClick={() => setTab('tokens')}><PackageSearch size={16} /> TOKENS</button>
        <button className={tab === 'tasks' ? 'active' : ''} onClick={() => setTab('tasks')}><History size={16} /> TASKS</button>
        <button className={tab === 'automations' ? 'active' : ''} onClick={() => setTab('automations')}><ShieldCheck size={16} /> AUTO</button>
        <button className={tab === 'blueprints' ? 'active' : ''} onClick={() => setTab('blueprints')}><SlidersHorizontal size={16} /> BLUEPRINT</button>
        <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}><SlidersHorizontal size={16} /> SETTINGS</button>
        <button className={tab === 'launch' ? 'active' : ''} onClick={() => setTab('launch')}><Rocket size={16} /> LAUNCH</button>
        <button className={tab === 'bnb' ? 'active' : ''} onClick={() => setTab('bnb')}><Send size={16} /> BNB dry-run</button>
      </nav>

      <div className="layout">
        <section className="workspace">
          {tab === 'wallets' && <WalletsView wallets={wallets} groups={groups} health={health} bnbPriceUsd={bnbMarket?.priceUsd ?? 0} busy={busy} run={run} />}
          {tab === 'groups' && <GroupsView groups={groups} bnbPriceUsd={bnbMarket?.priceUsd ?? 0} busy={busy} run={run} />}
          {tab === 'dev' && <DevWalletsView wallets={wallets} busy={busy} run={run} bnbPriceUsd={bnbMarket?.priceUsd ?? 0} />}
          {tab === 'tokens' && <TokensView groups={groups} wallets={wallets} busy={busy} run={run} />}
          {tab === 'tasks' && <TasksView groups={groups} wallets={wallets} busy={busy} run={run} />}
          {tab === 'automations' && <AutomationsView busy={busy} run={run} />}
          {tab === 'blueprints' && <BlueprintsView busy={busy} run={run} />}
          {tab === 'settings' && <SettingsView wallets={wallets} busy={busy} run={run} />}
          {tab === 'launch' && <LaunchView groups={groups} wallets={wallets} busy={busy} run={run} />}
          {tab === 'bnb' && <BnbView groups={groups} busy={busy} run={run} />}
        </section>
        <aside className="activity">
          <h2>Live</h2>
          <button className="ghost" onClick={() => void load()}><RefreshCw size={15} /> Atualizar</button>
          <div className="event-list">
            {events.map((event) => (
              <div key={event.id} className={`event ${event.severity}`}>
                <span>{new Date(event.createdAt).toLocaleTimeString()}</span>
                <strong>{event.type}</strong>
                <p>{event.message}</p>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </main>
  );
}

function WalletsView({ wallets, health, bnbPriceUsd, busy, run }: { wallets: WalletRecord[]; groups: GroupRecord[]; health: HealthStatus; bnbPriceUsd: number; busy: boolean; run: (action: () => Promise<void>) => Promise<void> }) {
  const [count, setCount] = useState(10);
  const [prefix, setPrefix] = useState('BUNE');
  const [tags, setTags] = useState('');
  const [importText, setImportText] = useState('');
  const [status, setStatus] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [search, setSearch] = useState('');
  const [relabelTag, setRelabelTag] = useState('DEV');
  const [relabelPrefix, setRelabelPrefix] = useState('DEV');
  const [relabelStartAt, setRelabelStartAt] = useState(1);
  const [legacyPassword, setLegacyPassword] = useState('');
  const [watchAddress, setWatchAddress] = useState('0x8894E0a0c962CB723c1976a4421c95949bE2D4E3');
  const [watchLabel, setWatchLabel] = useState('SIM-BNB-WHALE');
  const [watchTags, setWatchTags] = useState('SIM_READY,WATCH_ONLY');

  const allTags = useMemo(
    () => [...new Set(wallets.flatMap((wallet) => wallet.tags))].sort((a, b) => a.localeCompare(b)),
    [wallets]
  );
  const filtered = wallets.filter((wallet) => {
    if (status && wallet.status !== status) return false;
    if (tagFilter && !wallet.tags.includes(tagFilter)) return false;
    if (search) {
      const needle = search.toLowerCase();
      return wallet.label.toLowerCase().includes(needle) || wallet.address.toLowerCase().includes(needle) || wallet.tags.some((tag) => tag.toLowerCase().includes(needle));
    }
    return true;
  });

  return (
    <>
      <div className="actions-grid">
        <form onSubmit={(event) => {
          event.preventDefault();
          void run(() => api('/api/wallets/generate', {
            method: 'POST',
            body: JSON.stringify({ count, labelPrefix: prefix, tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean) })
          }));
        }}>
          <h2><Plus size={17} /> Gerar</h2>
          <label>Qtd<input type="number" min="1" max="500" value={count} onChange={(event) => setCount(Number(event.target.value))} /></label>
          <label>Prefix<input value={prefix} onChange={(event) => setPrefix(event.target.value)} /></label>
          <label>Tags<input placeholder="tag1, tag2" value={tags} onChange={(event) => setTags(event.target.value)} /></label>
          <button disabled={busy}><Plus size={16} /> Gerar</button>
        </form>

        <form onSubmit={(event) => {
          event.preventDefault();
          void run(() => api('/api/wallets/import', {
            method: 'POST',
            body: JSON.stringify({ text: importText })
          }));
        }}>
          <h2><Download size={17} /> Importar</h2>
          <textarea rows={7} placeholder="privateKey por linha ou CSV: privateKey,address,label,tags" value={importText} onChange={(event) => setImportText(event.target.value)} />
          <button disabled={busy}><Download size={16} /> Importar</button>
        </form>

        <section className="form-panel">
          <h2><Download size={17} /> Export</h2>
          <p className="muted">CSV com todas as private keys disponiveis no SQLite local.</p>
          <div className="button-row">
            <button disabled={busy} onClick={() => void run(async () => {
              const response = await fetch('/api/wallets/export-csv', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({})
              });
              if (!response.ok) throw new Error((await response.json()).error);
              const blob = await response.blob();
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `bune-wallets-${Date.now()}.csv`;
              a.click();
              URL.revokeObjectURL(url);
            })}><Download size={16} /> Export CSV</button>
          </div>
          {health.legacyEncryptedKeys > 0 && (
            <div className="legacy-box">
              <p className="muted">{health.legacyEncryptedKeys} keys antigas precisam conversao unica.</p>
              <label>Senha antiga<input type="password" value={legacyPassword} onChange={(event) => setLegacyPassword(event.target.value)} /></label>
              <button disabled={busy || !legacyPassword} onClick={() => void run(() => api('/api/wallets/migrate-legacy-keys', {
                method: 'POST',
                body: JSON.stringify({ password: legacyPassword })
              }))}>Converter keys antigas</button>
            </div>
          )}
        </section>

        <section className="form-panel">
          <h2><Tags size={17} /> Cadastro</h2>
          <p className="muted">Renomeia labels por tag sem mexer em address/private key.</p>
          <label>Tag alvo<input value={relabelTag} onChange={(event) => setRelabelTag(event.target.value)} placeholder="DEV, launch:abc" /></label>
          <label>Prefix novo<input value={relabelPrefix} onChange={(event) => setRelabelPrefix(event.target.value)} placeholder="DEV" /></label>
          <label>Start<input type="number" min="1" value={relabelStartAt} onChange={(event) => setRelabelStartAt(Number(event.target.value))} /></label>
          <button disabled={busy || !relabelTag || !relabelPrefix} onClick={() => void run(() => api('/api/wallets/relabel', {
            method: 'POST',
            body: JSON.stringify({ tag: relabelTag, prefix: relabelPrefix, startAt: relabelStartAt })
          }))}><Tags size={16} /> Renomear tag</button>
        </section>

        <form onSubmit={(event) => {
          event.preventDefault();
          void run(() => api('/api/wallets/watch-only', {
            method: 'POST',
            body: JSON.stringify({
              address: watchAddress,
              label: watchLabel,
              tags: watchTags.split(',').map((tag) => tag.trim()).filter(Boolean)
            })
          }));
        }}>
          <h2><Eye size={17} /> Watch-only</h2>
          <p className="muted">Readiness dry-run sem private key, sem export e sem assinatura.</p>
          <label>Address<input value={watchAddress} onChange={(event) => setWatchAddress(event.target.value)} /></label>
          <label>Label<input value={watchLabel} onChange={(event) => setWatchLabel(event.target.value)} /></label>
          <label>Tags<input value={watchTags} onChange={(event) => setWatchTags(event.target.value)} /></label>
          <button disabled={busy || !watchAddress}><Eye size={16} /> Add watch-only</button>
        </form>
      </div>

      <div className="table-tools">
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">Todos status</option>
          <option value="available">Disponiveis</option>
          <option value="reserved">Reservadas</option>
          <option value="archived">Arquivadas</option>
        </select>
        <select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}>
          <option value="">Todas tags</option>
          {allTags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
        </select>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="buscar label/address/tag" />
        <span className="muted">{filtered.length}/{wallets.length} wallets</span>
      </div>
      <WalletTable
        wallets={filtered}
        bnbPriceUsd={bnbPriceUsd}
        onPrimeChange={(walletId, primeRank) => run(() => api(`/api/wallets/${walletId}/prime`, {
          method: 'POST',
          body: JSON.stringify({ primeRank })
        }))}
      />
    </>
  );
}

function WalletTable({
  wallets,
  bnbPriceUsd,
  aliasGroupName,
  onTagClick,
  onPrimeChange
}: {
  wallets: WalletRecord[];
  bnbPriceUsd: number;
  aliasGroupName?: string;
  onTagClick?: (tag: string) => void;
  onPrimeChange?: (walletId: string, primeRank: number | null) => Promise<void>;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  const copyAddress = async (address: string) => {
    await navigator.clipboard.writeText(address);
    setCopied(address);
    window.setTimeout(() => setCopied((current) => current === address ? null : current), 1200);
  };

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {aliasGroupName && <th>Alias</th>}
            <th>Dev</th>
            <th>Prime</th>
            <th>Label</th>
            <th>Source</th>
            <th>Address</th>
            <th>Status</th>
            <th>BNB / USD</th>
            <th>Tags</th>
            <th>Uso</th>
          </tr>
        </thead>
        <tbody>
          {wallets.map((wallet, index) => (
            <tr key={wallet.id}>
              {aliasGroupName && <td>{groupAlias(aliasGroupName, index)}</td>}
              <td>{wallet.devRank ? <span className="dev-badge">D{wallet.devRank}</span> : '-'}</td>
              <td>
                <select
                  className="prime-select"
                  value={wallet.primeRank ?? ''}
                  onChange={(event) => void onPrimeChange?.(wallet.id, event.target.value ? Number(event.target.value) : null)}
                  disabled={!onPrimeChange}
                  title="Wallet PRIME compra antes e entra no ranking de PnL"
                >
                  <option value="">-</option>
                  {[1, 2, 3, 4, 5].map((rank) => <option key={rank} value={rank}>P{rank}</option>)}
                </select>
              </td>
              <td>{wallet.label}</td>
              <td><span className="muted">{wallet.source}</span></td>
              <td>
                <div className="address-cell">
                  <code title={wallet.address}>{wallet.address}</code>
                  <button className="icon-btn" title="Copiar address completo" onClick={() => void copyAddress(wallet.address)}>
                    <Copy size={13} />
                    {copied === wallet.address ? 'OK' : 'COPY'}
                  </button>
                </div>
              </td>
              <td><span className={`badge ${wallet.status}`}>{wallet.status}</span></td>
              <td>
                <div className="balance-cell">
                  <span>{numberFmt(wallet.balanceBNB)} BNB</span>
                  <small>{usdFmt(Number(wallet.balanceBNB || 0) * bnbPriceUsd)}</small>
                </div>
              </td>
              <td>
                <div className="tag-list">
                  {wallet.tags.length ? wallet.tags.map((tag) => (
                    <button key={tag} type="button" className="tag-chip" title={`Filtrar tag ${tag}`} onClick={() => onTagClick?.(tag)}>{tag}</button>
                  )) : <span className="muted">-</span>}
                </div>
              </td>
              <td>{wallet.useCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DevWalletsView({
  wallets,
  busy,
  run,
  bnbPriceUsd
}: {
  wallets: WalletRecord[];
  busy: boolean;
  run: (action: () => Promise<void>) => Promise<void>;
  bnbPriceUsd: number;
}) {
  const devWallets = useMemo(
    () => wallets.filter((wallet) => wallet.devRank !== null).sort((a, b) => (a.devRank ?? 99) - (b.devRank ?? 99)),
    [wallets]
  );
  const [walletId, setWalletId] = useState('');
  const [devRank, setDevRank] = useState(1);
  const [devRole, setDevRole] = useState('creator');
  const [devNotes, setDevNotes] = useState('');
  const [selectedWalletId, setSelectedWalletId] = useState('');
  const [selectedLabel, setSelectedLabel] = useState('');
  const [tagText, setTagText] = useState('');
  const [historyRows, setHistoryRows] = useState<WalletHistoryRecord[]>([]);
  const [positions, setPositions] = useState<WalletTokenPositionRecord[]>([]);

  const selectedWallet = wallets.find((wallet) => wallet.id === selectedWalletId) ?? wallets.find((wallet) => wallet.id === walletId) ?? devWallets[0] ?? null;

  useEffect(() => {
    if (!walletId && wallets[0]) setWalletId(wallets[0].id);
  }, [wallets, walletId]);

  useEffect(() => {
    if (!selectedWalletId && devWallets[0]) setSelectedWalletId(devWallets[0].id);
  }, [devWallets, selectedWalletId]);

  useEffect(() => {
    if (!selectedWallet) return;
    setSelectedLabel(selectedWallet.label);
    setTagText(selectedWallet.tags.join(', '));
    void Promise.all([
      api<WalletHistoryRecord[]>(`/api/wallet-history?walletId=${selectedWallet.id}&limit=80`),
      api<WalletTokenPositionRecord[]>(`/api/wallet-token-positions?walletId=${selectedWallet.id}`)
    ]).then(([history, tokenPositions]) => {
      setHistoryRows(history);
      setPositions(tokenPositions);
    }).catch(() => undefined);
  }, [selectedWallet?.id, selectedWallet?.tags.join(',')]);

  const configure = async () => {
    await api(`/api/wallets/${walletId}/dev`, {
      method: 'POST',
      body: JSON.stringify({ devRank, devRole, devNotes })
    });
    setSelectedWalletId(walletId);
  };

  const removeDev = async (id: string) => {
    await api(`/api/wallets/${id}/dev`, {
      method: 'POST',
      body: JSON.stringify({ devRank: null })
    });
  };

  const saveTags = async () => {
    if (!selectedWallet) return;
    await api(`/api/wallets/${selectedWallet.id}/tags`, {
      method: 'POST',
      body: JSON.stringify({ set: tagText.split(',').map((tag) => tag.trim()).filter(Boolean) })
    });
  };

  const saveLabel = async () => {
    if (!selectedWallet) return;
    await api(`/api/wallets/${selectedWallet.id}/label`, {
      method: 'POST',
      body: JSON.stringify({ label: selectedLabel })
    });
  };

  return (
    <>
      <div className="actions-grid dev-grid">
        <form onSubmit={(event) => {
          event.preventDefault();
          void run(configure);
        }}>
          <h2><KeyRound size={17} /> Config DEV wallet</h2>
          <label>Wallet<select value={walletId} onChange={(event) => {
            setWalletId(event.target.value);
            setSelectedWalletId(event.target.value);
          }}>
            {wallets.map((wallet) => (
              <option key={wallet.id} value={wallet.id}>
                {walletOptionText(wallet)}
              </option>
            ))}
          </select></label>
          <label>Slot DEV<input type="number" min="1" max="20" value={devRank} onChange={(event) => setDevRank(Number(event.target.value))} /></label>
          <label>Role<select value={devRole} onChange={(event) => setDevRole(event.target.value)}>
            <option value="creator">creator</option>
            <option value="backup">backup</option>
            <option value="funding">funding</option>
            <option value="ops">ops</option>
            <option value="custom">custom</option>
          </select></label>
          <label>Notas<input value={devNotes} onChange={(event) => setDevNotes(event.target.value)} placeholder="ex: cria Token1, campanha ABC" /></label>
          <button disabled={busy || !walletId}><KeyRound size={16} /> Salvar DEV</button>
        </form>

        <section className="form-panel">
          <h2><Tags size={17} /> Cadastro da wallet</h2>
          {selectedWallet ? (
            <>
              <p className="muted">{selectedWallet.label} // {shortAddress(selectedWallet.address)}</p>
              <label>Label<input value={selectedLabel} onChange={(event) => setSelectedLabel(event.target.value)} placeholder="DEV-0001, BUY-0012..." /></label>
              <button disabled={busy || !selectedLabel} onClick={() => void run(saveLabel)}><Tags size={16} /> Salvar label</button>
              <label>Tags<input value={tagText} onChange={(event) => setTagText(event.target.value)} placeholder="dev, launch:abc, bag:TOKEN" /></label>
              <button disabled={busy} onClick={() => void run(saveTags)}><Tags size={16} /> Salvar tags</button>
            </>
          ) : <p className="muted">Configure uma DEV wallet para editar tags rapido.</p>}
        </section>

        <section className="form-panel">
          <h2><History size={17} /> Controle</h2>
          <p className="muted">DEV cria/assina launch depois; PRIME compra primeiro; tags e historico dizem onde cada wallet foi usada.</p>
          <div className="mini-metrics">
            <div><strong>{devWallets.length}</strong><span>DEV wallets</span></div>
            <div><strong>{positions.length}</strong><span>token bags</span></div>
            <div><strong>{historyRows.length}</strong><span>historico</span></div>
          </div>
        </section>
      </div>

      <section className="preview">
        <div className="section-head">
          <div>
            <h2><KeyRound size={17} /> DEV wallets configuradas</h2>
            <p className="muted">Selecione uma para ver tags, tokens e historico. Slot DEV e unico: salvar D1 em outra wallet move o slot.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Slot</th><th>Role</th><th>Label</th><th>Address</th><th>BNB / USD</th><th>Tags</th><th>Acoes</th></tr></thead>
            <tbody>
              {devWallets.map((wallet) => (
                <tr key={wallet.id} className={selectedWallet?.id === wallet.id ? 'row-selected' : ''}>
                  <td><span className="dev-badge">D{wallet.devRank}</span></td>
                  <td>{wallet.devRole || '-'}</td>
                  <td>{wallet.label}</td>
                  <td><code title={wallet.address}>{wallet.address}</code></td>
                  <td>{numberFmt(wallet.balanceBNB)} BNB <span className="muted"> // {usdFmt(Number(wallet.balanceBNB || 0) * bnbPriceUsd)}</span></td>
                  <td><div className="tag-list">{wallet.tags.map((tag) => <span key={tag} className="tag-chip static">{tag}</span>)}</div></td>
                  <td>
                    <div className="button-row">
                      <button className="ghost" onClick={() => setSelectedWalletId(wallet.id)}><Eye size={14} /> Abrir</button>
                      <button className="ghost" disabled={busy} onClick={() => void run(() => removeDev(wallet.id))}>Remover</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!devWallets.length && <tr><td colSpan={7}><span className="muted">Nenhuma DEV wallet configurada.</span></td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {selectedWallet && (
        <section className="preview dev-detail">
          <div className="section-head">
            <div>
              <h2><History size={17} /> {selectedWallet.label} // historico</h2>
              <p className="muted">Address {selectedWallet.address} // {selectedWallet.devRank ? `DEV ${selectedWallet.devRank}` : 'wallet normal'}</p>
            </div>
          </div>
          <div className="dev-detail-grid">
            <div className="table-wrap">
              <table>
                <thead><tr><th>Token</th><th>Grupo</th><th>Balance</th><th>USD</th><th>PnL</th><th>Sync</th></tr></thead>
                <tbody>
                  {positions.map((position) => (
                    <tr key={`${position.walletId}-${position.tokenAddress}`}>
                      <td><code title={position.tokenAddress}>{position.tokenSymbol} // {shortAddress(position.tokenAddress)}</code></td>
                      <td>{position.groupName || position.campaignName || '-'}</td>
                      <td>{numberFmt(position.tokenBalance)}</td>
                      <td>{position.tokenUsdValue === null ? 'n/a' : usdFmt(position.tokenUsdValue)}</td>
                      <td><span className={position.pnlUsd !== null && position.pnlUsd >= 0 ? 'pnl-ok' : 'pnl-bad'}>{position.pnlUsd === null ? 'n/a' : usdFmt(position.pnlUsd)}</span></td>
                      <td>{new Date(position.updatedAt).toLocaleTimeString()}</td>
                    </tr>
                  ))}
                  {!positions.length && <tr><td colSpan={6}><span className="muted">Sem token bag registrada ainda.</span></td></tr>}
                </tbody>
              </table>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Hora</th><th>Tipo</th><th>Grupo</th><th>Token</th><th>BNB</th><th>Status</th></tr></thead>
                <tbody>
                  {historyRows.map((row) => (
                    <tr key={row.id}>
                      <td>{new Date(row.createdAt).toLocaleTimeString()}</td>
                      <td>{row.type}</td>
                      <td>{row.groupName || row.campaignName || '-'}</td>
                      <td>{row.tokenSymbol || (row.tokenAddress ? shortAddress(row.tokenAddress) : '-')}</td>
                      <td>{row.amountBNB || '-'}</td>
                      <td><span className={`badge ${row.status === 'confirmed' || row.status === 'queued_dry_run' ? 'available' : 'reserved'}`}>{row.status}</span></td>
                    </tr>
                  ))}
                  {!historyRows.length && <tr><td colSpan={6}><span className="muted">Sem historico ainda.</span></td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </>
  );
}

function GroupsView({ groups, bnbPriceUsd, busy, run }: { groups: GroupRecord[]; bnbPriceUsd: number; busy: boolean; run: (action: () => Promise<void>) => Promise<void> }) {
  const [name, setName] = useState('');
  const [campaignName, setCampaignName] = useState('');
  const [tokenAddress, setTokenAddress] = useState('');
  const [pullGroup, setPullGroup] = useState('');
  const [pullCount, setPullCount] = useState(20);
  const [pullTags, setPullTags] = useState('');
  const [preview, setPreview] = useState<WalletRecord[]>([]);
  const [detailGroupId, setDetailGroupId] = useState('');
  const [detailWallets, setDetailWallets] = useState<WalletRecord[]>([]);
  const [detailTag, setDetailTag] = useState('');

  const selectedGroup = pullGroup || groups[0]?.id || '';
  const detailGroup = groups.find((group) => group.id === detailGroupId) ?? null;
  const detailFilteredWallets = detailTag
    ? detailWallets.filter((wallet) => wallet.tags.includes(detailTag))
    : detailWallets;

  const openGroupDetail = async (group: GroupRecord) => {
    const wallets = await api<WalletRecord[]>(`/api/groups/${group.id}/wallets`);
    setDetailGroupId(group.id);
    setDetailWallets(wallets);
    setDetailTag('');
  };
  const setPrimeRank = async (walletId: string, primeRank: number | null) => {
    await api(`/api/wallets/${walletId}/prime`, {
      method: 'POST',
      body: JSON.stringify({ primeRank })
    });
    if (detailGroup) {
      const wallets = await api<WalletRecord[]>(`/api/groups/${detailGroup.id}/wallets`);
      setDetailWallets(wallets);
    }
  };

  return (
    <>
      <div className="actions-grid">
        <form onSubmit={(event) => {
          event.preventDefault();
          void run(() => api('/api/groups', {
            method: 'POST',
            body: JSON.stringify({ name, campaignName, tokenAddress: tokenAddress || undefined })
          }).then(() => {
            setName('');
            setCampaignName('');
            setTokenAddress('');
          }));
        }}>
          <h2><Users size={17} /> Grupo</h2>
          <label>Nome<input value={name} onChange={(event) => setName(event.target.value)} required /></label>
          <label>Campanha<input value={campaignName} onChange={(event) => setCampaignName(event.target.value)} /></label>
          <label>Token<input value={tokenAddress} onChange={(event) => setTokenAddress(event.target.value)} placeholder="0x..." /></label>
          <button disabled={busy}><Plus size={16} /> Criar</button>
        </form>

        <form onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            const result = await api<{ wallets: WalletRecord[] }>(`/api/groups/${selectedGroup}/pull-wallets`, {
              method: 'POST',
              body: JSON.stringify({ count: pullCount, tags: pullTags.split(',').map((tag) => tag.trim()).filter(Boolean), preview: true })
            });
            setPreview(result.wallets);
          });
        }}>
          <h2><ShieldCheck size={17} /> Pull wallets</h2>
          <label>Grupo<select value={selectedGroup} onChange={(event) => setPullGroup(event.target.value)}>
            {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select></label>
          <label>Qtd<input type="number" min="1" max="500" value={pullCount} onChange={(event) => setPullCount(Number(event.target.value))} /></label>
          <label>Tags filtro<input value={pullTags} onChange={(event) => setPullTags(event.target.value)} /></label>
          <div className="button-row">
            <button disabled={busy || !selectedGroup} type="submit"><RefreshCw size={16} /> Preview</button>
            <button disabled={busy || !selectedGroup || !preview.length} type="button" onClick={() => void run(() => api(`/api/groups/${selectedGroup}/pull-wallets`, {
              method: 'POST',
              body: JSON.stringify({ count: pullCount, tags: pullTags.split(',').map((tag) => tag.trim()).filter(Boolean), preview: false })
            }).then(() => setPreview([])))}><Archive size={16} /> Reservar</button>
          </div>
        </form>
      </div>

      {preview.length > 0 && (
        <section className="preview">
          <h2>Preview: {preview.length} wallets // maior saldo</h2>
          <WalletTable wallets={preview} bnbPriceUsd={bnbPriceUsd} />
        </section>
      )}

      <div className="group-grid">
        {groups.map((group) => (
          <div key={group.id} className={`group-row clickable ${detailGroupId === group.id ? 'selected' : ''}`} onClick={() => void run(() => openGroupDetail(group))}>
            <div>
              <strong>{group.name}</strong>
              <span>{group.campaignName || 'Sem campanha'} {group.tokenAddress ? `// ${shortAddress(group.tokenAddress)}` : ''}</span>
            </div>
            <div>{group.walletCount} wallets</div>
            <div>{numberFmt(group.totalBalanceBNB)} BNB</div>
            <button className="ghost" disabled={busy} onClick={(event) => {
              event.stopPropagation();
              void run(() => api(`/api/groups/${group.id}/release-wallets`, {
              method: 'POST',
              body: JSON.stringify({})
              }));
            }}>Liberar</button>
          </div>
        ))}
      </div>

      {detailGroup && (
        <section className="preview group-detail">
          <div className="section-head">
            <div>
              <h2><Eye size={17} /> {detailGroup.name} // wallets</h2>
              <p className="muted">{detailFilteredWallets.length}/{detailWallets.length} wallets // alias local // {detailGroup.campaignName || 'sem campaign'}</p>
            </div>
            <div className="button-row">
              {detailTag && <button type="button" className="ghost" onClick={() => setDetailTag('')}>tag: {detailTag} x</button>}
              <button type="button" className="ghost" onClick={() => void run(() => openGroupDetail(detailGroup))}><RefreshCw size={15} /> Sync</button>
            </div>
          </div>
          <WalletTable
            wallets={detailFilteredWallets}
            bnbPriceUsd={bnbPriceUsd}
            aliasGroupName={detailGroup.name}
            onTagClick={setDetailTag}
            onPrimeChange={(walletId, primeRank) => run(() => setPrimeRank(walletId, primeRank))}
          />
        </section>
      )}
    </>
  );
}

const taskKinds = ['four_meme_create', 'first_buy', 'sell_prime', 'bulk_sell', 'volume', 'bump', 'sell_buyback', 'fund', 'withdraw', 'collect_fees', 'warm'];
const triggerTypes = ['manual', 'delay', 'market_cap', 'profit', 'price', 'bonding_curve'];

function splitList(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function TokensView({
  groups,
  wallets,
  busy,
  run
}: {
  groups: GroupRecord[];
  wallets: WalletRecord[];
  busy: boolean;
  run: (action: () => Promise<void>) => Promise<void>;
}) {
  const [campaigns, setCampaigns] = useState<TerminalCampaignRecord[]>([]);
  const [tokens, setTokens] = useState<TerminalTokenRecord[]>([]);
  const [campaignName, setCampaignName] = useState('');
  const [campaignTags, setCampaignTags] = useState('');
  const [campaignGroupIds, setCampaignGroupIds] = useState<string[]>([]);
  const [campaignDevWalletIds, setCampaignDevWalletIds] = useState<string[]>([]);
  const [tokenName, setTokenName] = useState('');
  const [tokenSymbol, setTokenSymbol] = useState('');
  const [tokenAddress, setTokenAddress] = useState('');
  const [launchpad, setLaunchpad] = useState('four_meme');
  const [tokenStatus, setTokenStatus] = useState('draft');
  const [campaignId, setCampaignId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [devWalletId, setDevWalletId] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [tokenTags, setTokenTags] = useState('');
  const [metadataJson, setMetadataJson] = useState('{"website":"","x":"","telegram":""}');
  const devWallets = wallets.filter((wallet) => wallet.devRank !== null).sort((a, b) => (a.devRank ?? 99) - (b.devRank ?? 99));

  const loadTerminal = async () => {
    const [campaignList, tokenList] = await Promise.all([
      api<TerminalCampaignRecord[]>('/api/terminal/campaigns?limit=100'),
      api<TerminalTokenRecord[]>('/api/terminal/tokens?limit=150')
    ]);
    setCampaigns(campaignList);
    setTokens(tokenList);
  };

  useEffect(() => {
    void loadTerminal().catch(() => undefined);
  }, []);

  const toggle = (current: string[], id: string, checked: boolean) => checked
    ? Array.from(new Set([...current, id]))
    : current.filter((item) => item !== id);

  return (
    <>
      <div className="terminal-grid">
        <form onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            await api('/api/terminal/campaigns', {
              method: 'POST',
              body: JSON.stringify({
                name: campaignName,
                groupIds: campaignGroupIds,
                devWalletIds: campaignDevWalletIds,
                tags: splitList(campaignTags)
              })
            });
            setCampaignName('');
            setCampaignTags('');
            await loadTerminal();
          });
        }}>
          <h2><Users size={17} /> Campaign</h2>
          <label>Name<input value={campaignName} onChange={(event) => setCampaignName(event.target.value)} placeholder="Campaign Token1" required /></label>
          <label>Tags<input value={campaignTags} onChange={(event) => setCampaignTags(event.target.value)} placeholder="fourmeme, wave1" /></label>
          <section className="compact-checks">
            <strong>Groups</strong>
            {groups.slice(0, 12).map((group) => (
              <label key={group.id}><input type="checkbox" checked={campaignGroupIds.includes(group.id)} onChange={(event) => setCampaignGroupIds(toggle(campaignGroupIds, group.id, event.target.checked))} /> {group.name}</label>
            ))}
          </section>
          <section className="compact-checks">
            <strong>DEV</strong>
            {devWallets.slice(0, 10).map((wallet) => (
              <label key={wallet.id}><input type="checkbox" checked={campaignDevWalletIds.includes(wallet.id)} onChange={(event) => setCampaignDevWalletIds(toggle(campaignDevWalletIds, wallet.id, event.target.checked))} /> D{wallet.devRank} {wallet.label}</label>
            ))}
          </section>
          <button disabled={busy || !campaignName}><Plus size={16} /> Criar campaign</button>
        </form>

        <form className="terminal-wide-form" onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            await api('/api/terminal/tokens', {
              method: 'POST',
              body: JSON.stringify({
                name: tokenName,
                symbol: tokenSymbol,
                tokenAddress: tokenAddress || undefined,
                launchpad,
                status: tokenStatus,
                campaignId: campaignId || undefined,
                campaignName: campaigns.find((campaign) => campaign.id === campaignId)?.name || undefined,
                groupId: groupId || undefined,
                devWalletId: devWalletId || undefined,
                imageUrl: imageUrl || undefined,
                tags: splitList(tokenTags),
                metadata: parseJsonObject(metadataJson)
              })
            });
            setTokenName('');
            setTokenSymbol('');
            setTokenAddress('');
            await loadTerminal();
          });
        }}>
          <h2><PackageSearch size={17} /> Token registry</h2>
          <label>Name<input value={tokenName} onChange={(event) => setTokenName(event.target.value)} placeholder="Token Name" required /></label>
          <label>Ticker<input value={tokenSymbol} onChange={(event) => setTokenSymbol(event.target.value.toUpperCase())} placeholder="ABC" required /></label>
          <label>Status<select value={tokenStatus} onChange={(event) => setTokenStatus(event.target.value)}>
            <option value="draft">draft</option>
            <option value="pre_launch">pre_launch</option>
            <option value="live">live</option>
          </select></label>
          <label>Launchpad<input value={launchpad} onChange={(event) => setLaunchpad(event.target.value)} /></label>
          <label>Campaign<select value={campaignId} onChange={(event) => setCampaignId(event.target.value)}>
            <option value="">Sem campaign</option>
            {campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}
          </select></label>
          <label>Group<select value={groupId} onChange={(event) => setGroupId(event.target.value)}>
            <option value="">Sem group</option>
            {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select></label>
          <label>DEV wallet<select value={devWalletId} onChange={(event) => setDevWalletId(event.target.value)}>
            <option value="">Sem DEV</option>
            {devWallets.map((wallet) => <option key={wallet.id} value={wallet.id}>D{wallet.devRank} {wallet.label}</option>)}
          </select></label>
          <label>Token address<input value={tokenAddress} onChange={(event) => setTokenAddress(event.target.value)} placeholder="vazio antes do create" /></label>
          <label>Image URL<input value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="https://..." /></label>
          <label>Tags<input value={tokenTags} onChange={(event) => setTokenTags(event.target.value)} placeholder="bag, wave1" /></label>
          <label className="wide">Metadata JSON<textarea rows={3} value={metadataJson} onChange={(event) => setMetadataJson(event.target.value)} /></label>
          <button disabled={busy || !tokenName || !tokenSymbol}><Plus size={16} /> Registrar token</button>
        </form>
      </div>

      <section className="preview">
        <div className="section-head">
          <div>
            <h2><PackageSearch size={17} /> Tokens / campaigns</h2>
            <p className="muted">{campaigns.length} campaigns // {tokens.length} tokens // token address pode ficar vazio ate o pos-create</p>
          </div>
          <button className="ghost" onClick={() => void loadTerminal()}><RefreshCw size={15} /> Sync</button>
        </div>
        <div className="terminal-lists">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Campaign</th><th>Groups</th><th>DEV</th><th>Tokens</th><th>Status</th><th>Acoes</th></tr></thead>
              <tbody>
                {campaigns.map((campaign) => (
                  <tr key={campaign.id}>
                    <td>{campaign.name}</td>
                    <td>{campaign.groupIds.length}</td>
                    <td>{campaign.devWalletIds.length}</td>
                    <td>{campaign.tokenCount}</td>
                    <td><span className={`badge ${campaign.status === 'active' ? 'available' : 'archived'}`}>{campaign.status}</span></td>
                    <td><button className="ghost" disabled={busy || campaign.status === 'archived'} onClick={() => void run(async () => {
                      await api(`/api/terminal/campaigns/${campaign.id}/archive`, { method: 'POST', body: '{}' });
                      await loadTerminal();
                    })}>Arquivar</button></td>
                  </tr>
                ))}
                {!campaigns.length && <tr><td colSpan={6}><span className="muted">Nenhuma campaign registrada.</span></td></tr>}
              </tbody>
            </table>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Token</th><th>Campaign</th><th>Group/DEV</th><th>Address</th><th>Price/MC</th><th>Status</th><th>Acoes</th></tr></thead>
              <tbody>
                {tokens.map((token) => (
                  <tr key={token.id}>
                    <td><strong>{token.symbol}</strong><span className="muted"> // {token.name}</span></td>
                    <td>{token.campaignName || '-'}</td>
                    <td>{token.groupName || '-'} / {token.devWalletLabel || '-'}</td>
                    <td>{token.tokenAddress ? <code title={token.tokenAddress}>{shortAddress(token.tokenAddress)}</code> : <span className="muted">pre-create</span>}</td>
                    <td>{token.tokenPriceUsd === null ? 'n/a' : usdFmt(token.tokenPriceUsd)} / {token.marketCapUsd === null ? 'n/a' : usdFmt(token.marketCapUsd)}</td>
                    <td><span className={`badge ${token.status === 'archived' ? 'archived' : 'available'}`}>{token.status}</span></td>
                    <td><button className="ghost" disabled={busy || token.status === 'archived'} onClick={() => void run(async () => {
                      await api(`/api/terminal/tokens/${token.id}/archive`, { method: 'POST', body: '{}' });
                      await loadTerminal();
                    })}>Arquivar</button></td>
                  </tr>
                ))}
                {!tokens.length && <tr><td colSpan={7}><span className="muted">Nenhum token registrado.</span></td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  );
}

function TasksView({
  groups,
  wallets,
  busy,
  run
}: {
  groups: GroupRecord[];
  wallets: WalletRecord[];
  busy: boolean;
  run: (action: () => Promise<void>) => Promise<void>;
}) {
  const [tokens, setTokens] = useState<TerminalTokenRecord[]>([]);
  const [tasks, setTasks] = useState<TerminalTaskRecord[]>([]);
  const [tokenId, setTokenId] = useState('');
  const [name, setName] = useState('First buys');
  const [kind, setKind] = useState('first_buy');
  const [triggerType, setTriggerType] = useState('manual');
  const [triggerValue, setTriggerValue] = useState('');
  const [groupId, setGroupId] = useState('');
  const [walletTag, setWalletTag] = useState('');
  const [walletIdsText, setWalletIdsText] = useState('');
  const [paramsJson, setParamsJson] = useState('{"amountMode":"random_range","minAmountBnb":"0.005","maxAmountBnb":"0.02","slippagePct":"5"}');

  const allTags = useMemo(() => [...new Set(wallets.flatMap((wallet) => wallet.tags))].sort((a, b) => a.localeCompare(b)), [wallets]);

  const loadTerminal = async () => {
    const [tokenList, taskList] = await Promise.all([
      api<TerminalTokenRecord[]>('/api/terminal/tokens?limit=150'),
      api<TerminalTaskRecord[]>('/api/terminal/tasks?limit=150')
    ]);
    setTokens(tokenList);
    setTasks(taskList);
    if (!tokenId && tokenList[0]) setTokenId(tokenList[0].id);
  };

  useEffect(() => {
    void loadTerminal().catch(() => undefined);
  }, []);

  const selectedWalletIds = () => Array.from(new Set([
    ...splitList(walletIdsText),
    ...(walletTag ? wallets.filter((wallet) => wallet.tags.includes(walletTag)).map((wallet) => wallet.id) : [])
  ]));

  return (
    <>
      <form className="terminal-task-form" onSubmit={(event) => {
        event.preventDefault();
        void run(async () => {
          await api('/api/terminal/tasks', {
            method: 'POST',
            body: JSON.stringify({
              tokenId: tokenId || undefined,
              name,
              kind,
              triggerType,
              triggerValue: triggerValue || undefined,
              groupId: groupId || undefined,
              walletIds: selectedWalletIds(),
              params: parseJsonObject(paramsJson)
            })
          });
          await loadTerminal();
        });
      }}>
        <h2><History size={17} /> Task dry-run</h2>
        <label>Name<input value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>Kind<select value={kind} onChange={(event) => setKind(event.target.value)}>
          {taskKinds.map((item) => <option key={item} value={item}>{item}</option>)}
        </select></label>
        <label>Token<select value={tokenId} onChange={(event) => setTokenId(event.target.value)}>
          <option value="">Sem token</option>
          {tokens.map((token) => <option key={token.id} value={token.id}>{token.symbol} // {token.name}</option>)}
        </select></label>
        <label>Group<select value={groupId} onChange={(event) => setGroupId(event.target.value)}>
          <option value="">Sem group</option>
          {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
        </select></label>
        <label>Wallet tag<select value={walletTag} onChange={(event) => setWalletTag(event.target.value)}>
          <option value="">Sem tag</option>
          {allTags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
        </select></label>
        <label>Trigger<select value={triggerType} onChange={(event) => setTriggerType(event.target.value)}>
          {triggerTypes.map((item) => <option key={item} value={item}>{item}</option>)}
        </select></label>
        <label>Trigger value<input value={triggerValue} onChange={(event) => setTriggerValue(event.target.value)} placeholder="ex: 600s, 50000, 35%" /></label>
        <label className="wide">Wallet IDs<input value={walletIdsText} onChange={(event) => setWalletIdsText(event.target.value)} placeholder="opcional: wal_x, wal_y" /></label>
        <label className="wide">Params JSON<textarea rows={3} value={paramsJson} onChange={(event) => setParamsJson(event.target.value)} /></label>
        <button disabled={busy || !name}><Plus size={16} /> Criar task</button>
      </form>

      <section className="preview">
        <div className="section-head">
          <div>
            <h2><History size={17} /> Task queue</h2>
            <p className="muted">Tasks sao unidades encadeaveis: create, first_buy, sell_prime, volume, bump, fund/withdraw. V1 prepara dry-run.</p>
          </div>
          <button className="ghost" onClick={() => void loadTerminal()}><RefreshCw size={15} /> Sync</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Task</th><th>Kind</th><th>Token</th><th>Trigger</th><th>Wallets</th><th>Status</th><th>Dry-run checks</th><th>Acoes</th></tr></thead>
            <tbody>
              {tasks.map((task) => {
                const plan = task.dryRunPlan as { checks?: { walletCount?: number; tokenAddressKnown?: boolean; broadcastBlockReason?: string }; warnings?: string[]; queue?: unknown[] };
                return (
                  <tr key={task.id}>
                    <td>{task.name}</td>
                    <td>{task.kind}</td>
                    <td>{task.tokenSymbol || '-'}</td>
                    <td>{task.triggerType}{task.triggerValue ? ` // ${task.triggerValue}` : ''}</td>
                    <td>{plan.checks?.walletCount ?? task.walletIds.length}</td>
                    <td><span className={`badge ${task.status === 'cancelled' ? 'archived' : 'available'}`}>{task.status}</span></td>
                    <td><code>{plan.checks ? compactJson({ tokenAddress: plan.checks.tokenAddressKnown, broadcast: plan.checks.broadcastBlockReason, warnings: plan.warnings ?? [] }) : '{}'}</code></td>
                    <td>
                      <div className="button-row">
                        <button className="ghost" disabled={busy || task.status === 'cancelled'} onClick={() => void run(async () => {
                          await api(`/api/terminal/tasks/${task.id}/prepare-dry-run`, { method: 'POST', body: '{}' });
                          await loadTerminal();
                        })}>Dry-run</button>
                        <button className="ghost" disabled={busy || task.status === 'cancelled'} onClick={() => void run(async () => {
                          await api(`/api/terminal/tasks/${task.id}/cancel`, { method: 'POST', body: '{}' });
                          await loadTerminal();
                        })}>Cancel</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!tasks.length && <tr><td colSpan={8}><span className="muted">Nenhuma task criada.</span></td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function AutomationsView({ busy, run }: { busy: boolean; run: (action: () => Promise<void>) => Promise<void> }) {
  const [tokens, setTokens] = useState<TerminalTokenRecord[]>([]);
  const [tasks, setTasks] = useState<TerminalTaskRecord[]>([]);
  const [automations, setAutomations] = useState<TerminalAutomationRecord[]>([]);
  const [name, setName] = useState('Profit trigger');
  const [tokenId, setTokenId] = useState('');
  const [triggerType, setTriggerType] = useState('profit');
  const [triggerValue, setTriggerValue] = useState('35%');
  const [taskIdsText, setTaskIdsText] = useState('');

  const loadTerminal = async () => {
    const [tokenList, taskList, automationList] = await Promise.all([
      api<TerminalTokenRecord[]>('/api/terminal/tokens?limit=150'),
      api<TerminalTaskRecord[]>('/api/terminal/tasks?limit=150'),
      api<TerminalAutomationRecord[]>('/api/terminal/automations?limit=150')
    ]);
    setTokens(tokenList);
    setTasks(taskList);
    setAutomations(automationList);
    if (!tokenId && tokenList[0]) setTokenId(tokenList[0].id);
  };

  useEffect(() => {
    void loadTerminal().catch(() => undefined);
  }, []);

  return (
    <>
      <form className="terminal-task-form" onSubmit={(event) => {
        event.preventDefault();
        void run(async () => {
          await api('/api/terminal/automations', {
            method: 'POST',
            body: JSON.stringify({
              name,
              tokenId: tokenId || undefined,
              triggerType,
              triggerValue,
              taskIds: splitList(taskIdsText)
            })
          });
          await loadTerminal();
        });
      }}>
        <h2><ShieldCheck size={17} /> Automation trigger</h2>
        <label>Name<input value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>Token<select value={tokenId} onChange={(event) => setTokenId(event.target.value)}>
          <option value="">Global</option>
          {tokens.map((token) => <option key={token.id} value={token.id}>{token.symbol} // {token.name}</option>)}
        </select></label>
        <label>Trigger<select value={triggerType} onChange={(event) => setTriggerType(event.target.value)}>
          {triggerTypes.map((item) => <option key={item} value={item}>{item}</option>)}
        </select></label>
        <label>Value<input value={triggerValue} onChange={(event) => setTriggerValue(event.target.value)} placeholder="600s, 50k MC, 35%" /></label>
        <label className="wide">Task IDs<input value={taskIdsText} onChange={(event) => setTaskIdsText(event.target.value)} placeholder="tsk_1, tsk_2" /></label>
        <button disabled={busy || !name}><Plus size={16} /> Criar automation</button>
      </form>

      <section className="preview">
        <h2><ShieldCheck size={17} /> Automations</h2>
        <div className="terminal-lists">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Task</th><th>Kind</th><th>Token</th><th>Status</th><th>ID</th></tr></thead>
              <tbody>
                {tasks.map((task) => <tr key={task.id}><td>{task.name}</td><td>{task.kind}</td><td>{task.tokenSymbol || '-'}</td><td>{task.status}</td><td><code>{task.id}</code></td></tr>)}
              </tbody>
            </table>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Automation</th><th>Token</th><th>Trigger</th><th>Tasks</th><th>Status</th><th>Acoes</th></tr></thead>
              <tbody>
                {automations.map((automation) => (
                  <tr key={automation.id}>
                    <td>{automation.name}</td>
                    <td>{automation.tokenSymbol || '-'}</td>
                    <td>{automation.triggerType} // {automation.triggerValue || '-'}</td>
                    <td>{automation.taskIds.length}</td>
                    <td><span className={`badge ${automation.status === 'active' ? 'available' : 'archived'}`}>{automation.status}</span></td>
                    <td><button className="ghost" disabled={busy || automation.status === 'archived'} onClick={() => void run(async () => {
                      await api(`/api/terminal/automations/${automation.id}/archive`, { method: 'POST', body: '{}' });
                      await loadTerminal();
                    })}>Arquivar</button></td>
                  </tr>
                ))}
                {!automations.length && <tr><td colSpan={6}><span className="muted">Nenhuma automation.</span></td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  );
}

function BlueprintsView({ busy, run }: { busy: boolean; run: (action: () => Promise<void>) => Promise<void> }) {
  const [blueprints, setBlueprints] = useState<BlueprintRecord[]>([]);
  const [name, setName] = useState('Four.meme standard');
  const [description, setDescription] = useState('DEV cria, PRIME compra primeiro, BUY wave aleatoria, sell_prime por profit.');
  const [walletSlots, setWalletSlots] = useState('[{"slot":"DEV","count":1,"role":"creator"},{"slot":"PRIME","count":5,"priority":"first_buy"},{"slot":"BUY","count":20,"amountMode":"random_range"}]');
  const [taskTemplates, setTaskTemplates] = useState('[{"kind":"four_meme_create","trigger":"manual"},{"kind":"first_buy","trigger":"manual"},{"kind":"sell_prime","trigger":"profit","value":"35%"}]');
  const [settings, setSettings] = useState('{"broadcast":"disabled","defaultSlippageBuyPct":"5","defaultSlippageSellPct":"5"}');

  const loadTerminal = async () => {
    const list = await api<BlueprintRecord[]>('/api/terminal/blueprints?limit=100');
    setBlueprints(list);
  };

  useEffect(() => {
    void loadTerminal().catch(() => undefined);
  }, []);

  return (
    <>
      <form className="terminal-blueprint-form" onSubmit={(event) => {
        event.preventDefault();
        void run(async () => {
          await api('/api/terminal/blueprints', {
            method: 'POST',
            body: JSON.stringify({
              name,
              description,
              walletSlots: parseJsonObjectArray(walletSlots),
              taskTemplates: parseJsonObjectArray(taskTemplates),
              settings: parseJsonObject(settings)
            })
          });
          await loadTerminal();
        });
      }}>
        <h2><SlidersHorizontal size={17} /> Blueprint</h2>
        <label>Name<input value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>Description<input value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        <label>Wallet slots<textarea rows={4} value={walletSlots} onChange={(event) => setWalletSlots(event.target.value)} /></label>
        <label>Task templates<textarea rows={4} value={taskTemplates} onChange={(event) => setTaskTemplates(event.target.value)} /></label>
        <label>Settings<textarea rows={4} value={settings} onChange={(event) => setSettings(event.target.value)} /></label>
        <button disabled={busy || !name}><Plus size={16} /> Criar blueprint</button>
      </form>

      <section className="preview">
        <h2><SlidersHorizontal size={17} /> Blueprints salvos</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Wallet slots</th><th>Tasks</th><th>Settings</th><th>Status</th><th>Acoes</th></tr></thead>
            <tbody>
              {blueprints.map((blueprint) => (
                <tr key={blueprint.id}>
                  <td>{blueprint.name}<span className="muted"> // {blueprint.description}</span></td>
                  <td><code>{compactJson(blueprint.walletSlots)}</code></td>
                  <td><code>{compactJson(blueprint.taskTemplates)}</code></td>
                  <td><code>{compactJson(blueprint.settings)}</code></td>
                  <td><span className={`badge ${blueprint.status === 'active' ? 'available' : 'archived'}`}>{blueprint.status}</span></td>
                  <td><button className="ghost" disabled={busy || blueprint.status === 'archived'} onClick={() => void run(async () => {
                    await api(`/api/terminal/blueprints/${blueprint.id}/archive`, { method: 'POST', body: '{}' });
                    await loadTerminal();
                  })}>Arquivar</button></td>
                </tr>
              ))}
              {!blueprints.length && <tr><td colSpan={6}><span className="muted">Nenhum blueprint.</span></td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function SettingsView({
  wallets,
  busy,
  run
}: {
  wallets: WalletRecord[];
  busy: boolean;
  run: (action: () => Promise<void>) => Promise<void>;
}) {
  const [settings, setSettings] = useState<AppSettingRecord[]>([]);
  const [keyName, setKeyName] = useState('rpc_http');
  const [value, setValue] = useState('');
  const devWallets = wallets.filter((wallet) => wallet.devRank !== null).sort((a, b) => (a.devRank ?? 99) - (b.devRank ?? 99));

  const loadTerminal = async () => {
    const list = await api<AppSettingRecord[]>('/api/terminal/settings');
    setSettings(list);
  };

  useEffect(() => {
    void loadTerminal().catch(() => undefined);
  }, []);

  const presetValue = (key: string) => settings.find((setting) => setting.key === key)?.value ?? '';

  return (
    <>
      <form className="terminal-task-form" onSubmit={(event) => {
        event.preventDefault();
        void run(async () => {
          await api('/api/terminal/settings', {
            method: 'POST',
            body: JSON.stringify({ key: keyName, value })
          });
          await loadTerminal();
        });
      }}>
        <h2><SlidersHorizontal size={17} /> Settings locais</h2>
        <label>Key<select value={keyName} onChange={(event) => {
          setKeyName(event.target.value);
          setValue(presetValue(event.target.value));
        }}>
          {['rpc_http', 'rpc_ws', 'fee_wallet_id', 'default_slippage_buy_pct', 'default_slippage_sell_pct', 'quick_buy_bnb', 'quick_sell_pct', 'hide_addresses', 'auto_open_links', 'default_executor'].map((item) => <option key={item} value={item}>{item}</option>)}
        </select></label>
        <label>Value<input value={value} onChange={(event) => setValue(event.target.value)} placeholder="valor local" /></label>
        <button disabled={busy || !keyName}><SlidersHorizontal size={16} /> Salvar</button>
        <div className="button-row">
          {devWallets.slice(0, 5).map((wallet) => (
            <button key={wallet.id} type="button" className="ghost" onClick={() => {
              setKeyName('fee_wallet_id');
              setValue(wallet.id);
            }}>Fee D{wallet.devRank}</button>
          ))}
        </div>
        <p className="muted">Settings ainda nao ligam broadcast. Servem para travar RPC/WS, fee wallet, presets e executor default para fases futuras.</p>
      </form>

      <section className="preview">
        <h2><SlidersHorizontal size={17} /> Settings</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Key</th><th>Value</th><th>Updated</th></tr></thead>
            <tbody>
              {settings.map((setting) => (
                <tr key={setting.key}><td>{setting.key}</td><td><code>{setting.value}</code></td><td>{new Date(setting.updatedAt).toLocaleString()}</td></tr>
              ))}
              {!settings.length && <tr><td colSpan={3}><span className="muted">Nenhuma setting salva.</span></td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function LaunchView({ groups, wallets, busy, run }: { groups: GroupRecord[]; wallets: WalletRecord[]; busy: boolean; run: (action: () => Promise<void>) => Promise<void> }) {
  const [campaignName, setCampaignName] = useState('');
  const [tokenAddress, setTokenAddress] = useState('');
  const [tokenName, setTokenName] = useState('');
  const [tokenSymbol, setTokenSymbol] = useState('');
  const [tokenDesc, setTokenDesc] = useState('');
  const [tokenLabel, setTokenLabel] = useState('Meme');
  const [tokenImageUrl, setTokenImageUrl] = useState('');
  const [imageFilePath, setImageFilePath] = useState('');
  const [tokenWebsite, setTokenWebsite] = useState('');
  const [tokenX, setTokenX] = useState('');
  const [tokenTelegram, setTokenTelegram] = useState('');
  const [raisedSymbol, setRaisedSymbol] = useState('BNB');
  const [preSale, setPreSale] = useState('0');
  const [onlyMPC, setOnlyMPC] = useState(false);
  const [feePlan, setFeePlan] = useState(true);
  const [devWalletId, setDevWalletId] = useState('');
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [amountMode, setAmountMode] = useState<LaunchAmountMode>('per_wallet');
  const [amountBnb, setAmountBnb] = useState('0.01');
  const [minAmountBnb, setMinAmountBnb] = useState('0.005');
  const [maxAmountBnb, setMaxAmountBnb] = useState('0.02');
  const [balancePercent, setBalancePercent] = useState('25');
  const [maxWallets, setMaxWallets] = useState(20);
  const [queue, setQueue] = useState<LaunchDryRunQueue | null>(null);
  const [selectedWalletIds, setSelectedWalletIds] = useState<string[]>([]);
  const [walletAmounts, setWalletAmounts] = useState<Record<string, string>>({});
  const [bag, setBag] = useState<TokenBagSnapshot | null>(null);
  const [showAmountModal, setShowAmountModal] = useState(false);
  const [fourConfig, setFourConfig] = useState<FourMemeConfigSnapshot | null>(null);
  const [launchDraft, setLaunchDraft] = useState<LaunchDraftRecord | null>(null);
  const [savedDrafts, setSavedDrafts] = useState<LaunchDraftRecord[]>([]);
  const [createPlan, setCreatePlan] = useState<FourMemeCreateDryRunPlan | null>(null);
  const [positionSummaries, setPositionSummaries] = useState<PositionSummaryRecord[]>([]);
  const [positionFills, setPositionFills] = useState<PositionFillRecord[]>([]);
  const [manualWalletId, setManualWalletId] = useState('');
  const [manualSide, setManualSide] = useState<'buy' | 'sell'>('buy');
  const [manualStatus, setManualStatus] = useState<'confirmed' | 'simulated' | 'planned'>('confirmed');
  const [manualQuantity, setManualQuantity] = useState('');
  const [manualValueUsd, setManualValueUsd] = useState('');
  const [manualPriceUsd, setManualPriceUsd] = useState('');
  const [manualBnbAmount, setManualBnbAmount] = useState('');
  const [manualBnbPriceUsd, setManualBnbPriceUsd] = useState('');
  const [manualBnbPriceSource, setManualBnbPriceSource] = useState('');
  const [manualTxHash, setManualTxHash] = useState('');
  const [manualNotes, setManualNotes] = useState('');
  const [confirmFillId, setConfirmFillId] = useState('');
  const [confirmQuantity, setConfirmQuantity] = useState('');
  const [confirmValueUsd, setConfirmValueUsd] = useState('');
  const [confirmPriceUsd, setConfirmPriceUsd] = useState('');
  const [confirmBnbAmount, setConfirmBnbAmount] = useState('');
  const [confirmBnbPriceUsd, setConfirmBnbPriceUsd] = useState('');
  const [confirmBnbPriceSource, setConfirmBnbPriceSource] = useState('');
  const [confirmTxHash, setConfirmTxHash] = useState('');
  const [txPreview, setTxPreview] = useState<TxPreview | null>(null);
  const [fourMemeTradePlan, setFourMemeTradePlan] = useState<FourMemeTradeDryRun | null>(null);
  const [fourMemeExecutionPlan, setFourMemeExecutionPlan] = useState<FourMemeExecutionPlan | null>(null);
  const [savedExecutionPlans, setSavedExecutionPlans] = useState<ExecutionPlanRecord[]>([]);
  const [executionPlanReview, setExecutionPlanReview] = useState<ExecutionPlanReview | null>(null);
  const [finalConfirmation, setFinalConfirmation] = useState<ExecutionPlanFinalConfirmation | null>(null);
  const [finalConfirmationText, setFinalConfirmationText] = useState('');
  const [finalOperatorNote, setFinalOperatorNote] = useState('');

  const selectedGroups = groups.filter((group) => selectedGroupIds.includes(group.id));
  const devWallets = wallets.filter((wallet) => wallet.devRank !== null).sort((a, b) => (a.devRank ?? 99) - (b.devRank ?? 99));
  const activeWalletChoices = useMemo(() => {
    const selected = selectedWalletIds.length ? selectedWalletIds : queue?.queue.map((item) => item.walletId) ?? [];
    const selectedSet = new Set(selected);
    const groupSet = new Set(selectedGroupIds);
    return wallets
      .filter((wallet) => selectedSet.has(wallet.id) || (wallet.activeGroupId && groupSet.has(wallet.activeGroupId)))
      .sort((a, b) => (a.primeRank ?? 999) - (b.primeRank ?? 999) || a.label.localeCompare(b.label));
  }, [wallets, selectedWalletIds, queue, selectedGroupIds]);
  const selectedKey = selectedWalletIds.join(',');
  const activeDrafts = savedDrafts.filter((draft) => draft.status !== 'archived');

  const loadLaunchDrafts = async () => {
    const drafts = await api<LaunchDraftRecord[]>('/api/launch-drafts?limit=50');
    setSavedDrafts(drafts);
  };

  const loadExecutionPlans = async () => {
    const query = new URLSearchParams({ limit: '30' });
    if (tokenAddress) query.set('tokenAddress', tokenAddress);
    const plans = await api<ExecutionPlanRecord[]>(`/api/four-meme/execution-plans?${query.toString()}`);
    setSavedExecutionPlans(plans);
  };

  useEffect(() => {
    if (!selectedGroupIds.length && groups[0]) {
      setSelectedGroupIds([groups[0].id]);
      setCampaignName(groups[0].campaignName ?? '');
      setTokenName(groups[0].campaignName ?? '');
      setTokenAddress(groups[0].tokenAddress ?? '');
    }
  }, [groups, selectedGroupIds.length]);

  useEffect(() => {
    if (!devWalletId && devWallets[0]) setDevWalletId(devWallets[0].id);
  }, [devWalletId, devWallets]);

  useEffect(() => {
    if (!manualWalletId && activeWalletChoices[0]) setManualWalletId(activeWalletChoices[0].id);
  }, [manualWalletId, activeWalletChoices]);

  useEffect(() => {
    if (!fourConfig?.published.length) return;
    if (!fourConfig.published.some((token) => token.symbol === raisedSymbol)) {
      setRaisedSymbol(fourConfig.published[0].symbol);
    }
  }, [fourConfig, raisedSymbol]);

  useEffect(() => {
    void loadLaunchDrafts().catch(() => undefined);
    void loadExecutionPlans().catch(() => undefined);
  }, []);

  useEffect(() => {
    void loadExecutionPlans().catch(() => undefined);
  }, [tokenAddress]);

  const selectedQueue = useMemo(
    () => queue?.queue.filter((item) => selectedWalletIds.includes(item.walletId)) ?? [],
    [queue, selectedWalletIds]
  );
  const selectedCostByWallet = useMemo(
    () => Object.fromEntries(selectedQueue.map((item) => [item.walletId, walletAmounts[item.walletId] ?? item.amountBNB])),
    [selectedQueue, walletAmounts]
  );
  const selectedTotalBnb = Object.values(selectedCostByWallet).reduce((sum, value) => sum + Number(value || 0), 0);
  const selectedTotalUsd = selectedTotalBnb * (queue?.bnbPriceUsd ?? 0);
  const primeSellRows = useMemo(
    () => (bag?.rows ?? [])
      .filter((row) => row.primeRank !== null)
      .sort((a, b) => (b.pnlUsd ?? Number.NEGATIVE_INFINITY) - (a.pnlUsd ?? Number.NEGATIVE_INFINITY)),
    [bag]
  );
  const ledgerPrimeRows = useMemo(
    () => positionSummaries
      .filter((row) => row.primeRank !== null)
      .sort((a, b) => (b.totalPnlUsd ?? Number.NEGATIVE_INFINITY) - (a.totalPnlUsd ?? Number.NEGATIVE_INFINITY)),
    [positionSummaries]
  );
  const ledgerTotals = useMemo(() => positionSummaries.reduce((acc, row) => {
    acc.invested += row.investedUsd;
    acc.sold += row.soldUsd;
    acc.realized += row.realizedPnlUsd;
    acc.current += row.currentUsdValue ?? 0;
    acc.unrealized += row.unrealizedPnlUsd ?? 0;
    acc.total += row.totalPnlUsd ?? 0;
    acc.pending += row.pendingCostUsd;
    return acc;
  }, { invested: 0, sold: 0, realized: 0, current: 0, unrealized: 0, total: 0, pending: 0 }), [positionSummaries]);
  const plannedFills = useMemo(
    () => positionFills.filter((fill) => fill.status === 'planned' || fill.status === 'simulated'),
    [positionFills]
  );
  const selectedPlannedFill = plannedFills.find((fill) => fill.id === confirmFillId) ?? null;

  const optionalNumber = (value: string): number | undefined => {
    if (!value.trim()) return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  };

  const launchBody = (includeWalletOverrides: boolean) => ({
    groupIds: selectedGroupIds,
    tokenAddress,
    campaignName,
    amountMode,
    amountBnb,
    minAmountBnb,
    maxAmountBnb,
    balancePercent,
    maxWallets,
    devWalletId: devWalletId || undefined,
    walletAmounts: includeWalletOverrides ? walletAmounts : undefined
  });

  const bagBody = () => selectedWalletIds.length
    ? { walletIds: selectedWalletIds, tokenAddress, walletCostBnb: selectedCostByWallet }
    : { groupIds: selectedGroupIds, tokenAddress, costBnbPerWallet: amountBnb };

  const refreshPositions = async () => {
    if (!tokenAddress) return;
    const query = new URLSearchParams({ tokenAddress, limit: '300' });
    const [summaries, fills] = await Promise.all([
      api<PositionSummaryRecord[]>(`/api/positions/summary?${query.toString()}`),
      api<PositionFillRecord[]>(`/api/positions/fills?${query.toString()}`)
    ]);
    setPositionSummaries(summaries);
    setPositionFills(fills);
  };

  useEffect(() => {
    if (!bag || !tokenAddress) return;
    const timer = window.setInterval(() => {
      void api<TokenBagSnapshot>('/api/token-bags/refresh', {
        method: 'POST',
        body: JSON.stringify(bagBody())
      }).then(setBag).catch(() => undefined);
    }, 20_000);
    return () => window.clearInterval(timer);
  }, [bag?.tokenAddress, tokenAddress, amountBnb, selectedGroupIds.join(','), selectedKey, JSON.stringify(selectedCostByWallet)]);

  const generateQueue = async (includeWalletOverrides: boolean) => {
    const result = await api<LaunchDryRunQueue>('/api/launch/first-buys-dry-run', {
      method: 'POST',
      body: JSON.stringify(launchBody(includeWalletOverrides))
    });
    setQueue(result);
    setSelectedWalletIds(result.queue.map((item) => item.walletId));
    setWalletAmounts(Object.fromEntries(result.queue.map((item) => [item.walletId, item.amountBNB])));
    setBag(null);
    setPositionSummaries([]);
    setPositionFills([]);
  };

  const syncFourMeme = async () => {
    const config = await api<FourMemeConfigSnapshot>('/api/four-meme/config');
    setFourConfig(config);
    return config;
  };

  const prepareLaunchDraft = async () => {
    const result = await api<LaunchDraftRecord>('/api/launch-drafts', {
      method: 'POST',
      body: JSON.stringify({
        campaignName,
        groupIds: selectedGroupIds,
        devWalletId: devWalletId || undefined,
        tokenAddress: tokenAddress || undefined,
        name: tokenName,
        shortName: tokenSymbol,
        desc: tokenDesc,
        imgUrl: tokenImageUrl,
        imageFilePath,
        label: tokenLabel,
        webUrl: tokenWebsite,
        twitterUrl: tokenX,
      telegramUrl: tokenTelegram,
        raisedSymbol,
        preSale,
        onlyMPC,
        feePlan
      })
    });
    setLaunchDraft(result);
    setCreatePlan(null);
    await loadLaunchDrafts();
    if (!campaignName) setCampaignName(result.name);
  };

  const prepareCreatePlan = async (draftId: string) => {
    const result = await api<FourMemeCreateDryRunPlan>(`/api/launch-drafts/${draftId}/prepare-create-dry-run`, {
      method: 'POST',
      body: '{}'
    });
    setCreatePlan(result);
    const updated = await api<LaunchDraftRecord>(`/api/launch-drafts/${draftId}`);
    setLaunchDraft(updated);
    await loadLaunchDrafts();
  };

  const loadDraftIntoForm = (draft: LaunchDraftRecord) => {
    setLaunchDraft(draft);
    setCreatePlan(draft.createDryRunPlan?.dryRunOnly ? draft.createDryRunPlan as unknown as FourMemeCreateDryRunPlan : null);
    setCampaignName(draft.campaignName ?? draft.name);
    setSelectedGroupIds(draft.groupIds);
    setDevWalletId(draft.devWalletId ?? '');
    setTokenAddress(draft.tokenAddress ?? '');
    setTokenName(draft.name);
    setTokenSymbol(draft.shortName);
    setTokenDesc(draft.description);
    setTokenLabel(draft.label);
    setTokenImageUrl(draft.imgUrl);
    setImageFilePath(draft.imageFilePath ?? '');
    setTokenWebsite(draft.webUrl);
    setTokenX(draft.twitterUrl);
    setTokenTelegram(draft.telegramUrl);
    setRaisedSymbol(draft.raisedSymbol);
    setPreSale(draft.preSale);
    setOnlyMPC(draft.onlyMPC);
    setFeePlan(draft.feePlan);
  };

  const saveLaunchPlanToLedger = async () => {
    if (!queue || !tokenAddress) return;
    const selectedRows = queue.queue.filter((item) => selectedWalletIds.includes(item.walletId));
    const symbol = tokenSymbol || bag?.tokenSymbol || 'TOKEN';
    await api('/api/positions/fills/bulk', {
      method: 'POST',
      body: JSON.stringify({
        fills: selectedRows.map((item) => {
          const bnbAmount = walletAmounts[item.walletId] ?? item.amountBNB;
          const valueUsd = queue.bnbPriceUsd ? Number(bnbAmount) * queue.bnbPriceUsd : item.plannedCostUsd;
          return {
            walletId: item.walletId,
            tokenAddress,
            tokenSymbol: symbol,
            side: 'buy',
            status: 'planned',
            source: 'launch_dry_run',
            bnbAmount,
            bnbPriceUsd: queue.bnbPriceUsd ?? undefined,
            valueUsd: valueUsd && Number.isFinite(valueUsd) ? valueUsd : undefined,
            groupId: item.groupId,
            campaignName: queue.campaignName || campaignName || undefined,
            launchDraftId: launchDraft?.id,
            notes: 'first_buy_queue_saved_to_ledger',
            metadata: {
              dryRunOnly: true,
              queueIndex: item.index,
              amountMode: item.amountMode,
              devWalletId: queue.devWallet?.walletId ?? null,
              canAfford: item.canAfford
            }
          };
        })
      })
    });
    await refreshPositions();
  };

  const recordManualFill = async () => {
    if (!manualWalletId || !tokenAddress) return;
    await api('/api/positions/fills', {
      method: 'POST',
      body: JSON.stringify({
        walletId: manualWalletId,
        tokenAddress,
        tokenSymbol: tokenSymbol || bag?.tokenSymbol || 'TOKEN',
        side: manualSide,
        status: manualStatus,
        source: 'manual',
        quantityTokens: manualQuantity || undefined,
        priceUsd: optionalNumber(manualPriceUsd),
        valueUsd: optionalNumber(manualValueUsd),
        bnbAmount: manualBnbAmount || undefined,
        bnbPriceUsd: optionalNumber(manualBnbPriceUsd) ?? queue?.bnbPriceUsd ?? undefined,
        txHash: manualTxHash || undefined,
        groupId: wallets.find((wallet) => wallet.id === manualWalletId)?.activeGroupId || selectedGroupIds[0] || undefined,
        campaignName: campaignName || queue?.campaignName || undefined,
        launchDraftId: launchDraft?.id,
        notes: manualNotes || undefined,
        metadata: { entry: 'manual_ui', dryRunOnly: manualStatus !== 'confirmed', bnbPriceSource: manualBnbPriceSource || undefined }
      })
    });
    setManualQuantity('');
    setManualValueUsd('');
    setManualPriceUsd('');
    setManualBnbAmount('');
    setManualBnbPriceUsd('');
    setManualBnbPriceSource('');
    setManualTxHash('');
    setManualNotes('');
    await refreshPositions();
  };

  const confirmSelectedFill = async () => {
    if (!confirmFillId) return;
    await api(`/api/positions/fills/${confirmFillId}/confirm`, {
      method: 'POST',
      body: JSON.stringify({
        quantityTokens: confirmQuantity || undefined,
        priceUsd: optionalNumber(confirmPriceUsd),
        valueUsd: optionalNumber(confirmValueUsd),
        bnbAmount: confirmBnbAmount || undefined,
        bnbPriceUsd: optionalNumber(confirmBnbPriceUsd) ?? undefined,
        txHash: confirmTxHash,
        source: 'onchain',
        metadata: { entry: 'confirm_ui', bnbPriceSource: confirmBnbPriceSource || undefined }
      })
    });
    setConfirmFillId('');
    setConfirmQuantity('');
    setConfirmValueUsd('');
    setConfirmPriceUsd('');
    setConfirmBnbAmount('');
    setConfirmBnbPriceUsd('');
    setConfirmBnbPriceSource('');
    setConfirmTxHash('');
    await refreshPositions();
  };

  const applyTxPreview = (preview: TxPreview, target: 'manual' | 'confirm') => {
    setTxPreview(preview);
    const suggestion = preview.suggestion;
    if (target === 'manual') {
      if (suggestion.side) setManualSide(suggestion.side);
      if (suggestion.quantityTokens) setManualQuantity(suggestion.quantityTokens);
      if (suggestion.valueUsd !== null) setManualValueUsd(String(Number(suggestion.valueUsd.toFixed(8))));
      if (suggestion.priceUsd !== null) setManualPriceUsd(String(Number(suggestion.priceUsd.toFixed(12))));
      if (suggestion.bnbAmount) setManualBnbAmount(suggestion.bnbAmount);
      if (preview.bnbPrice) {
        setManualBnbPriceUsd(String(preview.bnbPrice.priceUsd));
        setManualBnbPriceSource(`${preview.bnbPrice.source}${preview.bnbPrice.historical ? ':historical' : ':current'}`);
      }
      if (suggestion.tokenSymbol && !tokenSymbol) setTokenSymbol(suggestion.tokenSymbol);
    } else {
      if (suggestion.quantityTokens) setConfirmQuantity(suggestion.quantityTokens);
      if (suggestion.valueUsd !== null) setConfirmValueUsd(String(Number(suggestion.valueUsd.toFixed(8))));
      if (suggestion.priceUsd !== null) setConfirmPriceUsd(String(Number(suggestion.priceUsd.toFixed(12))));
      if (suggestion.bnbAmount) setConfirmBnbAmount(suggestion.bnbAmount);
      if (preview.bnbPrice) {
        setConfirmBnbPriceUsd(String(preview.bnbPrice.priceUsd));
        setConfirmBnbPriceSource(`${preview.bnbPrice.source}${preview.bnbPrice.historical ? ':historical' : ':current'}`);
      }
    }
  };

  const previewManualTx = async () => {
    if (!manualTxHash) return;
    const preview = await api<TxPreview>('/api/tx/preview', {
      method: 'POST',
      body: JSON.stringify({
        txHash: manualTxHash,
        walletId: manualWalletId || undefined,
        tokenAddress,
        side: manualSide
      })
    });
    applyTxPreview(preview, 'manual');
  };

  const previewConfirmTx = async () => {
    if (!confirmTxHash) return;
    const preview = await api<TxPreview>('/api/tx/preview', {
      method: 'POST',
      body: JSON.stringify({
        txHash: confirmTxHash,
        fillId: confirmFillId || undefined,
        tokenAddress,
        side: selectedPlannedFill?.side ?? undefined
      })
    });
    applyTxPreview(preview, 'confirm');
  };

  const prepareFourMemeTradeDryRun = async (side: 'buy' | 'sell') => {
    if (!tokenAddress) return;
    if (side === 'buy') {
      const item = selectedQueue[0] ?? queue?.queue[0];
      const fundsBnb = item ? walletAmounts[item.walletId] ?? item.amountBNB : amountBnb;
      if (!fundsBnb) return;
      const result = await api<FourMemeTradeDryRun>('/api/four-meme/trade-dry-run', {
        method: 'POST',
        body: JSON.stringify({
          tokenAddress,
          side: 'buy',
          buyMode: 'funds',
          fundsBnb,
          walletId: item?.walletId,
          slippageBps: 500
        })
      });
      setFourMemeTradePlan(result);
      return;
    }
    const row = bag?.rows.find((item) => Number(item.tokenBalance) > 0);
    if (!row?.tokenBalanceRaw) return;
    const result = await api<FourMemeTradeDryRun>('/api/four-meme/trade-dry-run', {
      method: 'POST',
      body: JSON.stringify({
        tokenAddress,
        side: 'sell',
        amountWei: row.tokenBalanceRaw,
        walletId: row.walletId,
        slippageBps: 500
      })
    });
    setFourMemeTradePlan(result);
  };

  const prepareFourMemeExecutionPlan = async (side: 'buy' | 'sell') => {
    if (!tokenAddress) return;
    if (side === 'buy') {
      const items = selectedQueue.length ? selectedQueue : queue?.queue ?? [];
      if (!items.length) return;
      const result = await api<FourMemeExecutionPlan>('/api/four-meme/execution-plan', {
        method: 'POST',
        body: JSON.stringify({
          tokenAddress,
          side: 'buy',
          walletIds: items.map((item) => item.walletId),
          buyMode: 'funds',
          walletFundsBnb: Object.fromEntries(items.map((item) => [item.walletId, walletAmounts[item.walletId] ?? item.amountBNB])),
          slippageBps: 500,
          order: 'prime_first'
        })
      });
      setFourMemeExecutionPlan(result);
      setExecutionPlanReview(null);
      setFinalConfirmation(null);
      return;
    }
    const rows = (bag?.rows ?? []).filter((row) => Number(row.tokenBalance) > 0 && row.tokenBalanceRaw);
    if (!rows.length) return;
    const result = await api<FourMemeExecutionPlan>('/api/four-meme/execution-plan', {
      method: 'POST',
      body: JSON.stringify({
        tokenAddress,
        side: 'sell',
        walletIds: rows.map((row) => row.walletId),
        walletAmountWei: Object.fromEntries(rows.map((row) => [row.walletId, row.tokenBalanceRaw])),
        slippageBps: 500,
        order: 'prime_first'
      })
    });
    setFourMemeExecutionPlan(result);
    setExecutionPlanReview(null);
    setFinalConfirmation(null);
  };

  const saveFourMemeExecutionPlan = async () => {
    if (!fourMemeExecutionPlan) return;
    const saved = await api<ExecutionPlanRecord>('/api/four-meme/execution-plans', {
      method: 'POST',
      body: JSON.stringify({ plan: fourMemeExecutionPlan })
    });
    setSavedExecutionPlans((current) => [saved, ...current.filter((item) => item.id !== saved.id)].slice(0, 30));
  };

  const reviewExecutionPlan = async (id: string) => {
    const review = await api<ExecutionPlanReview>(`/api/four-meme/execution-plans/${id}/review`, {
      method: 'POST',
      body: '{}'
    });
    setExecutionPlanReview(review);
    setFinalConfirmation(null);
    setFourMemeExecutionPlan(review.livePlan);
    await loadExecutionPlans();
  };

  const openFinalConfirmation = async (id: string) => {
    const result = await api<ExecutionPlanFinalConfirmation>(`/api/four-meme/execution-plans/${id}/final-confirmation`);
    setFinalConfirmation(result);
    setFinalConfirmationText('');
    setFinalOperatorNote('');
  };

  const submitFinalConfirmation = async () => {
    if (!finalConfirmation) return;
    const result = await api<ExecutionPlanFinalConfirmation>(`/api/four-meme/execution-plans/${finalConfirmation.planId}/final-confirmation`, {
      method: 'POST',
      body: JSON.stringify({
        confirmationText: finalConfirmationText,
        operatorNote: finalOperatorNote || undefined
      })
    });
    setFinalConfirmation(result);
    await loadExecutionPlans();
  };

  const archiveExecutionPlan = async (id: string) => {
    await api<ExecutionPlanRecord>(`/api/four-meme/execution-plans/${id}/archive`, {
      method: 'POST',
      body: '{}'
    });
    await loadExecutionPlans();
  };

  const toggleGroup = (group: GroupRecord, checked: boolean) => {
    setSelectedGroupIds((current) => {
      const next = checked ? Array.from(new Set([...current, group.id])) : current.filter((id) => id !== group.id);
      return next;
    });
    if (checked && !campaignName) setCampaignName(group.campaignName ?? '');
    if (checked && !tokenName) setTokenName(group.campaignName ?? '');
    if (checked && !tokenAddress) setTokenAddress(group.tokenAddress ?? '');
    setQueue(null);
    setSelectedWalletIds([]);
    setBag(null);
  };

  const toggleWallet = (walletId: string, checked: boolean) => {
    setSelectedWalletIds((current) => checked
      ? Array.from(new Set([...current, walletId]))
      : current.filter((id) => id !== walletId));
  };

  const amountFields = () => {
    if (amountMode === 'random_range') {
      return (
        <>
          <label>Min BNB<input value={minAmountBnb} onChange={(event) => setMinAmountBnb(event.target.value)} /></label>
          <label>Max BNB<input value={maxAmountBnb} onChange={(event) => setMaxAmountBnb(event.target.value)} /></label>
        </>
      );
    }
    if (amountMode === 'percent_balance') {
      return <label>% do saldo<input value={balancePercent} onChange={(event) => setBalancePercent(event.target.value)} /></label>;
    }
    return <label>{amountMode === 'per_wallet' ? 'Default BNB' : 'Same all BNB'}<input value={amountBnb} onChange={(event) => setAmountBnb(event.target.value)} /></label>;
  };

  const applySameAmount = () => {
    if (!queue) return;
    setWalletAmounts(Object.fromEntries(queue.queue.map((item) => [item.walletId, amountBnb])));
  };

  const randomizeAmounts = () => {
    if (!queue) return;
    const min = Number(minAmountBnb);
    const max = Number(maxAmountBnb);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max < min) return;
    setWalletAmounts(Object.fromEntries(queue.queue.map((item) => {
      const value = min + Math.random() * (max - min);
      return [item.walletId, value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')];
    })));
  };

  const applyBalancePercent = () => {
    if (!queue) return;
    const percent = Number(balancePercent);
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) return;
    setWalletAmounts(Object.fromEntries(queue.queue.map((item) => {
      const value = Number(item.currentBalanceBNB || 0) * percent / 100;
      return [item.walletId, value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '') || '0'];
    })));
  };

  return (
    <>
      <section className="launch-panel">
        <form className="launch-form" onSubmit={(event) => {
          event.preventDefault();
          void run(() => generateQueue(false));
        }}>
          <h2><Rocket size={17} /> TOKEN DRAFT // LAUNCH dry-run</h2>
          <section className="group-picker">
            <h2><Users size={15} /> Grupos da campaign</h2>
            {groups.map((group) => (
              <label key={group.id} className="group-check">
                <input type="checkbox" checked={selectedGroupIds.includes(group.id)} onChange={(event) => toggleGroup(group, event.target.checked)} />
                <span><strong>{group.name}</strong><small>{group.walletCount} wallets // {numberFmt(group.totalBalanceBNB)} BNB</small></span>
              </label>
            ))}
          </section>
          <label>DEV wallet<select value={devWalletId} onChange={(event) => setDevWalletId(event.target.value)}>
            <option value="">Sem DEV configurada</option>
            {devWallets.map((wallet) => (
              <option key={wallet.id} value={wallet.id}>{walletOptionText(wallet)} // {wallet.devRole || 'creator'}</option>
            ))}
          </select></label>
          <label>Campaign<input value={campaignName} onChange={(event) => setCampaignName(event.target.value)} placeholder="nome da campanha/token" /></label>
          <label>Name<input value={tokenName} onChange={(event) => setTokenName(event.target.value)} placeholder="nome do token" /></label>
          <label>Ticker<input value={tokenSymbol} onChange={(event) => setTokenSymbol(event.target.value.toUpperCase())} placeholder="ABC" /></label>
          <label>Label<input value={tokenLabel} onChange={(event) => setTokenLabel(event.target.value)} placeholder="Meme" /></label>
          <label>Raised token<select value={raisedSymbol} onChange={(event) => setRaisedSymbol(event.target.value)}>
            {fourConfig?.published.length ? fourConfig.published.map((token) => (
              <option key={token.symbol} value={token.symbol}>{token.symbol}</option>
            )) : <option value="BNB">BNB</option>}
          </select></label>
          <label>PreSale<input value={preSale} onChange={(event) => setPreSale(event.target.value)} placeholder="0" /></label>
          <label className="wide">Description<input value={tokenDesc} onChange={(event) => setTokenDesc(event.target.value)} placeholder="descrição usada no draft Four.meme" /></label>
          <label>Image URL<input value={tokenImageUrl} onChange={(event) => setTokenImageUrl(event.target.value)} placeholder="https://... depois do upload" /></label>
          <label>Image path<input value={imageFilePath} onChange={(event) => setImageFilePath(event.target.value)} placeholder="C:\\...\\logo.png" /></label>
          <label>Website<input value={tokenWebsite} onChange={(event) => setTokenWebsite(event.target.value)} placeholder="https://..." /></label>
          <label>X/Twitter<input value={tokenX} onChange={(event) => setTokenX(event.target.value)} placeholder="https://x.com/..." /></label>
          <label>Telegram<input value={tokenTelegram} onChange={(event) => setTokenTelegram(event.target.value)} placeholder="https://t.me/..." /></label>
          <label className="check-row"><input type="checkbox" checked={onlyMPC} onChange={(event) => setOnlyMPC(event.target.checked)} /> X Mode</label>
          <label className="check-row"><input type="checkbox" checked={feePlan} onChange={(event) => setFeePlan(event.target.checked)} /> AntiSniper/FeePlan</label>
          <label className="post-token">Token address pós-create<input value={tokenAddress} onChange={(event) => setTokenAddress(event.target.value)} placeholder="0x... depois de criado" /></label>
          <label>Wallets<input type="number" min="1" max="500" value={maxWallets} onChange={(event) => setMaxWallets(Number(event.target.value))} /></label>
          <label>Modo BNB<select value={amountMode} onChange={(event) => setAmountMode(event.target.value as LaunchAmountMode)}>
            <option value="per_wallet">Fixed/manual</option>
            <option value="random_range">Random range</option>
            <option value="percent_balance">% balance</option>
            <option value="fixed">Same all</option>
          </select></label>
          {amountFields()}
          <div className="button-row">
            <button type="button" disabled={busy} onClick={() => void run(async () => { await syncFourMeme(); })}><RefreshCw size={16} /> Sync Four.meme</button>
            <button type="button" disabled={busy || !tokenName || !tokenSymbol || !tokenDesc} onClick={() => void run(prepareLaunchDraft)}><PackageSearch size={16} /> Salvar draft</button>
            <button type="button" disabled={busy || !launchDraft} onClick={() => launchDraft && void run(() => prepareCreatePlan(launchDraft.id))}><ShieldCheck size={16} /> Create dry-run</button>
            <button type="submit" disabled={busy || !selectedGroupIds.length || !tokenAddress}><Rocket size={16} /> Gerar fila</button>
            <button type="button" disabled={busy || !queue?.queue.length} onClick={() => setShowAmountModal(true)}><SlidersHorizontal size={16} /> Config valores</button>
            <button type="button" disabled={busy || !queue?.queue.length} onClick={() => void run(() => generateQueue(true))}><SlidersHorizontal size={16} /> Recalcular</button>
            <button type="button" disabled={busy || !tokenAddress || (!selectedGroupIds.length && !selectedWalletIds.length)} onClick={() => void run(async () => {
              const result = await api<TokenBagSnapshot>('/api/token-bags/refresh', {
                method: 'POST',
                body: JSON.stringify(bagBody())
              });
              setBag(result);
              await refreshPositions();
            })}><PackageSearch size={16} /> Refresh bag</button>
            <button type="button" disabled={busy || !tokenAddress} onClick={() => void run(refreshPositions)}><TrendingUp size={16} /> Sync PnL</button>
          </div>
          <p className="muted">{'Draft pre-create usa metadata; address só aparece depois da criação real. Four.meme flow: bonding curve -> graduation/liquidez -> Pancake. Dry-run only: sem assinatura, sem raw tx.'}</p>
          {fourConfig && (
            <div className="four-config-strip">
              {fourConfig.published.map((token) => (
                <span key={token.symbol} className="pill">
                  {token.symbol} raise {token.totalBAmount} // b0 {token.b0Amount} // fee {token.buyFee}/{token.sellFee}
                </span>
              ))}
            </div>
          )}
          {activeDrafts.length > 0 && (
            <div className="saved-drafts">
              {activeDrafts.slice(0, 8).map((draft) => (
                <div key={draft.id} className={launchDraft?.id === draft.id ? 'saved-draft active' : 'saved-draft'}>
                  <strong>{draft.shortName}</strong>
                  <span>{draft.campaignName || draft.name} // {draft.status}</span>
                  <button type="button" className="ghost" onClick={() => loadDraftIntoForm(draft)}>Carregar</button>
                  <button type="button" className="ghost" onClick={() => void run(() => prepareCreatePlan(draft.id))}>Dry-run</button>
                </div>
              ))}
            </div>
          )}
        </form>

        <section className="launch-summary">
          <h2><TrendingUp size={17} /> Draft / Bag live</h2>
          {bag ? (
            <>
              <div className="bag-metrics">
                <div><strong>{bag.tokenSymbol}</strong><span>{shortAddress(bag.tokenAddress)}</span></div>
                <div><strong>{bag.tokenPriceUsd === null ? 'n/a' : usdFmt(bag.tokenPriceUsd)}</strong><span>{bag.tokenPriceSource} price</span></div>
                <div><strong>{bag.tokenLifecycleStatus || 'n/a'}</strong><span>{bag.tokenProgress === null ? 'progress n/a' : `${(bag.tokenProgress * 100).toFixed(2)}% progress`}</span></div>
                <div><strong>{bag.tokenMarketCapUsd === null ? 'n/a' : usdFmt(bag.tokenMarketCapUsd)}</strong><span>market cap</span></div>
                <div><strong>{numberFmt(bag.totalTokenBalance)}</strong><span>total token</span></div>
                <div><strong>{bag.totalUsdValue === null ? 'n/a' : usdFmt(bag.totalUsdValue)}</strong><span>bag USD</span></div>
                <div><strong className={bag.totalPnlUsd !== null && bag.totalPnlUsd >= 0 ? 'pnl-ok' : 'pnl-bad'}>{bag.totalPnlUsd === null ? 'n/a' : usdFmt(bag.totalPnlUsd)}</strong><span>PnL dry-run</span></div>
              </div>
              <div className="prime-ranking">
                <h2><Crown size={15} /> PRIME PnL // sell priority</h2>
                {primeSellRows.length ? primeSellRows.map((row, index) => (
                  <div key={row.walletId} className="prime-rank-row">
                    <strong>SELL #{index + 1}</strong>
                    <span>P{row.primeRank} {row.walletLabel}</span>
                    <span>{row.pnlUsd === null ? 'PnL n/a' : usdFmt(row.pnlUsd)}</span>
                  </div>
                )) : <p className="muted">Marque wallets PRIME 1..5 para aparecer ranking de venda.</p>}
              </div>
            </>
          ) : launchDraft ? (
            <>
              <div className="bag-metrics draft-metrics">
                <div><strong>{launchDraft.shortName}</strong><span>{launchDraft.name}</span></div>
                <div><strong>{launchDraft.raisedSymbol}</strong><span>raised token</span></div>
                <div><strong>{String(launchDraft.raisedTokenSnapshot.totalBAmount ?? 'n/a')}</strong><span>total raise</span></div>
                <div><strong>{launchDraft.preSale}</strong><span>preSale</span></div>
                <div><strong>{launchDraft.onlyMPC ? 'ON' : 'OFF'} / {launchDraft.feePlan ? 'ON' : 'OFF'}</strong><span>X Mode / FeePlan</span></div>
              </div>
              <div className="draft-preview">
                <p><strong>{launchDraft.label}</strong> // {launchDraft.description}</p>
                <p className="muted">
                  {launchDraft.webUrl || 'sem website'} // {launchDraft.twitterUrl || 'sem X'} // {launchDraft.telegramUrl || 'sem Telegram'}
                </p>
                <p className="muted">
                  {launchDraft.status} // groups {launchDraft.groupIds.length} // {launchDraft.devWalletLabel ? `DEV ${launchDraft.devWalletLabel}` : 'sem DEV'} // {launchDraft.note}
                </p>
                {createPlan && (
                  <div className="control-grid">
                    <span>auth: {Boolean(createPlan.auth.blocked) ? 'blocked' : 'ready'}</span>
                    <span>image: {String(createPlan.imageUpload.source ?? 'n/a')}</span>
                    <span>create API: {Boolean(createPlan.createApi.blocked) ? 'blocked' : 'ready'}</span>
                    <span>factory tx: blocked</span>
                  </div>
                )}
              </div>
            </>
          ) : (
            <p className="muted">Preencha name/ticker/description e clique em Preparar draft. Use Token address pós-create só depois do token existir.</p>
          )}
        </section>
      </section>

      {queue && (
        <section className="preview launch-queue">
          <div className="section-head">
            <div>
              <h2>Fila primeiras compras // {selectedQueue.length}/{queue.queue.length} wallets</h2>
              <p className="muted">
                {selectedGroups.map((group) => group.name).join('+') || 'sem grupo'} // {queue.devWallet ? `DEV D${queue.devWallet.devRank} ${queue.devWallet.label}` : 'sem DEV'} // {queue.amountMode} // {numberFmt(String(selectedTotalBnb))} BNB // {selectedTotalUsd ? usdFmt(selectedTotalUsd) : 'USD n/a'} // {queue.note}
              </p>
            </div>
            <div className="button-row">
              <button className="ghost" onClick={() => setSelectedWalletIds(queue.queue.map((item) => item.walletId))}>Todos</button>
              <button className="ghost" onClick={() => setSelectedWalletIds([])}>Nenhum</button>
              <button className="ghost" disabled={busy || !selectedWalletIds.length || !tokenAddress} onClick={() => void run(saveLaunchPlanToLedger)}>Salvar ledger</button>
              <button className="ghost" disabled={busy || !tokenAddress || !queue.queue.length} onClick={() => void run(() => prepareFourMemeTradeDryRun('buy'))}>Buy quote</button>
              <button className="ghost" disabled={busy || !tokenAddress || !queue.queue.length} onClick={() => void run(() => prepareFourMemeExecutionPlan('buy'))}>Exec plan</button>
              <button className="ghost" disabled={busy || !tokenAddress} onClick={() => void run(refreshPositions)}>Sync PnL</button>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Use</th>
                  <th>#</th>
                  <th>Prime</th>
                  <th>Alias</th>
                  <th>Label</th>
                  <th>Address</th>
                  <th>Buy</th>
                  <th>USD</th>
                  <th>Saldo BNB</th>
                  <th>Tags</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {queue.queue.map((item) => (
                  <tr key={item.walletId}>
                    <td><input type="checkbox" checked={selectedWalletIds.includes(item.walletId)} onChange={(event) => toggleWallet(item.walletId, event.target.checked)} /></td>
                    <td>{item.index}</td>
                    <td>{item.primeRank ? <span className="prime-badge">P{item.primeRank}</span> : '-'}</td>
                    <td>{item.groupAlias}</td>
                    <td>{item.walletLabel}</td>
                    <td><code title={item.address}>{item.address}</code></td>
                    <td><input className="amount-cell-input" value={walletAmounts[item.walletId] ?? item.amountBNB} onChange={(event) => setWalletAmounts((current) => ({ ...current, [item.walletId]: event.target.value }))} /> BNB</td>
                    <td>{queue.bnbPriceUsd ? usdFmt(Number(walletAmounts[item.walletId] ?? item.amountBNB) * queue.bnbPriceUsd) : 'n/a'}</td>
                    <td>{numberFmt(item.currentBalanceBNB)} BNB</td>
                    <td><div className="tag-list">{item.tags.map((tag) => <span key={tag} className="tag-chip static">{tag}</span>)}</div></td>
                    <td><span className={`badge ${item.canAfford ? 'available' : 'archived'}`}>{item.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tokenAddress && (
        <section className="preview launch-bag">
          <div className="section-head">
            <div>
              <h2><History size={17} /> Manual fill / confirm planned</h2>
              <p className="muted">Registra compra/venda manual no ledger ou transforma planned fill em confirmed com txHash. Nao assina nem faz broadcast.</p>
            </div>
            <div className="button-row">
              <button className="ghost" disabled={busy || !bag?.rows.some((row) => Number(row.tokenBalance) > 0)} onClick={() => void run(() => prepareFourMemeTradeDryRun('sell'))}>Sell quote</button>
              <button className="ghost" disabled={busy || !bag?.rows.some((row) => Number(row.tokenBalance) > 0)} onClick={() => void run(() => prepareFourMemeExecutionPlan('sell'))}>Sell plan</button>
              <button className="ghost" disabled={busy} onClick={() => void run(refreshPositions)}><RefreshCw size={15} /> Sync</button>
            </div>
          </div>
          <div className="terminal-grid">
            <form onSubmit={(event) => {
              event.preventDefault();
              void run(recordManualFill);
            }}>
              <h2><Plus size={17} /> Registrar fill</h2>
              <label>Wallet<select value={manualWalletId} onChange={(event) => setManualWalletId(event.target.value)}>
                <option value="">Selecione</option>
                {(activeWalletChoices.length ? activeWalletChoices : wallets).map((wallet) => (
                  <option key={wallet.id} value={wallet.id}>{walletOptionText(wallet)}</option>
                ))}
              </select></label>
              <label>Side<select value={manualSide} onChange={(event) => setManualSide(event.target.value as 'buy' | 'sell')}>
                <option value="buy">buy</option>
                <option value="sell">sell</option>
              </select></label>
              <label>Status<select value={manualStatus} onChange={(event) => setManualStatus(event.target.value as 'confirmed' | 'simulated' | 'planned')}>
                <option value="confirmed">confirmed</option>
                <option value="simulated">simulated</option>
                <option value="planned">planned</option>
              </select></label>
              <label>Token qty<input value={manualQuantity} onChange={(event) => setManualQuantity(event.target.value)} placeholder="ex: 1200000" /></label>
              <label>Value USD<input value={manualValueUsd} onChange={(event) => setManualValueUsd(event.target.value)} placeholder="ex: 25.50" /></label>
              <label>Price USD<input value={manualPriceUsd} onChange={(event) => setManualPriceUsd(event.target.value)} placeholder="opcional" /></label>
              <label>BNB<input value={manualBnbAmount} onChange={(event) => setManualBnbAmount(event.target.value)} placeholder="opcional" /></label>
              <label>TxHash<input value={manualTxHash} onChange={(event) => setManualTxHash(event.target.value)} placeholder="0x... se real" /></label>
              <button type="button" className="ghost" disabled={busy || !manualTxHash} onClick={() => void run(previewManualTx)}>
                <RefreshCw size={16} /> Ler tx
              </button>
              <label className="wide">Notes<input value={manualNotes} onChange={(event) => setManualNotes(event.target.value)} placeholder="motivo, exchange, ajuste manual..." /></label>
              <button disabled={busy || !manualWalletId || !tokenAddress || (manualSide === 'sell' && !manualQuantity)}>
                <Plus size={16} /> Registrar
              </button>
            </form>

            <form onSubmit={(event) => {
              event.preventDefault();
              void run(confirmSelectedFill);
            }}>
              <h2><ShieldCheck size={17} /> Confirmar planned</h2>
              <label>Planned fill<select value={confirmFillId} onChange={(event) => {
                const id = event.target.value;
                setConfirmFillId(id);
                const fill = plannedFills.find((item) => item.id === id);
                setConfirmBnbAmount(fill?.bnbAmount ?? '');
                setConfirmValueUsd(fill?.valueUsd ? String(fill.valueUsd) : '');
              }}>
                <option value="">Selecione</option>
                {plannedFills.map((fill) => (
                  <option key={fill.id} value={fill.id}>
                    {fill.side} {fill.walletLabel} // {fill.bnbAmount ?? '-'} BNB // {fill.valueUsd === null ? 'USD n/a' : usdFmt(fill.valueUsd)}
                  </option>
                ))}
              </select></label>
              <label>Token qty real<input value={confirmQuantity} onChange={(event) => setConfirmQuantity(event.target.value)} placeholder={selectedPlannedFill?.quantityTokens ?? 'quantidade recebida/vendida'} /></label>
              <label>Value USD real<input value={confirmValueUsd} onChange={(event) => setConfirmValueUsd(event.target.value)} placeholder="custo/proceeds real" /></label>
              <label>Price USD<input value={confirmPriceUsd} onChange={(event) => setConfirmPriceUsd(event.target.value)} placeholder="opcional" /></label>
              <label>BNB real<input value={confirmBnbAmount} onChange={(event) => setConfirmBnbAmount(event.target.value)} placeholder="opcional" /></label>
              <label className="wide">TxHash<input value={confirmTxHash} onChange={(event) => setConfirmTxHash(event.target.value)} placeholder="0x..." /></label>
              <button type="button" className="ghost" disabled={busy || !confirmTxHash} onClick={() => void run(previewConfirmTx)}>
                <RefreshCw size={16} /> Ler tx
              </button>
              <button disabled={busy || !confirmFillId || !confirmQuantity || !confirmTxHash}>
                <ShieldCheck size={16} /> Confirmar fill
              </button>
              <p className="muted">{plannedFills.length} planned/simulated pendentes. Confirmar cria/atualiza lote FIFO e remove pending planned.</p>
            </form>
          </div>
          {txPreview && (
            <div className="tx-preview">
              <strong>TX {shortAddress(txPreview.txHash)} // {txPreview.status} // block {txPreview.blockNumber}</strong>
              <span>
                {txPreview.suggestion.side || 'side?'} {txPreview.suggestion.tokenSymbol || 'TOKEN'} //
                qty {txPreview.suggestion.quantityTokens || 'n/a'} //
                BNB {txPreview.suggestion.bnbAmount || txPreview.nativeValueBNB || '0'} //
                USD {txPreview.suggestion.valueUsd === null ? 'n/a' : usdFmt(txPreview.suggestion.valueUsd)} //
                BNB/USD {txPreview.bnbPrice ? `${usdFmt(txPreview.bnbPrice.priceUsd)} ${txPreview.bnbPrice.historical ? 'hist' : 'now'} ${txPreview.bnbPrice.source}` : 'n/a'} //
                {txPreview.suggestion.confidence} // {txPreview.suggestion.reason} //
                explorer {txPreview.explorer.enabled ? `on ${txPreview.explorer.internalTxs}/${txPreview.explorer.tokenTransfers}` : 'off'}
              </span>
              {txPreview.warnings.length > 0 && <small>{txPreview.warnings.join(' // ')}</small>}
            </div>
          )}
          {fourMemeTradePlan && (
            <div className="tx-preview">
              <strong>Four.meme {fourMemeTradePlan.side} // {fourMemeTradePlan.tx.functionName} // {fourMemeTradePlan.broadcast ? 'broadcast' : 'dry-run'}</strong>
              <span>
                manager {shortAddress(fourMemeTradePlan.tokenInfo.tokenManager)} //
                value {fourMemeTradePlan.tx.valueBNB} BNB //
                gas {fourMemeTradePlan.simulation.estimateGas ?? 'n/a'} //
                call {fourMemeTradePlan.simulation.callSuccess === null ? 'skip' : fourMemeTradePlan.simulation.callSuccess ? 'ok' : 'revert'} //
                lifecycle {fourMemeTradePlan.market.lifecyclePhase ?? 'n/a'} //
                USD {fourMemeTradePlan.market.estimatedValueUsd === null ? 'n/a' : usdFmt(fourMemeTradePlan.market.estimatedValueUsd)}
              </span>
              <code>{compactJson({ quote: fourMemeTradePlan.quote, approval: fourMemeTradePlan.tx.approvalAmountWei, data: fourMemeTradePlan.tx.calldata.slice(0, 18) + '...' })}</code>
              {(fourMemeTradePlan.warnings.length > 0 || fourMemeTradePlan.simulation.errors.length > 0) && (
                <small>{[...fourMemeTradePlan.warnings, ...fourMemeTradePlan.simulation.errors].join(' // ')}</small>
              )}
            </div>
          )}
          {fourMemeExecutionPlan && (
            <div className="tx-preview">
              <strong>Execution plan {fourMemeExecutionPlan.side} // {fourMemeExecutionPlan.walletCount} wallets // blocked</strong>
              <div className="button-row">
                <button className="ghost" disabled={busy} onClick={() => void run(saveFourMemeExecutionPlan)}><History size={14} /> Salvar plan</button>
                <button className="ghost" disabled={busy} onClick={() => void run(loadExecutionPlans)}><RefreshCw size={14} /> Plans</button>
              </div>
              <span>
                trade {fourMemeExecutionPlan.totals.tradeValueBNB} BNB //
                gas {fourMemeExecutionPlan.totals.gasCostBNB ?? 'n/a'} BNB //
                required {fourMemeExecutionPlan.totals.requiredNativeBNB} BNB //
                ready {fourMemeExecutionPlan.totals.ready} //
                insuff {fourMemeExecutionPlan.totals.insufficientBnb} //
                simErr {fourMemeExecutionPlan.totals.simulationErrors} //
                gas? {fourMemeExecutionPlan.totals.gasUnknown}
              </span>
              <div className="table-wrap mini-table">
                <table>
                  <thead><tr><th>#</th><th>Wallet</th><th>Prime</th><th>Nonce</th><th>Gas</th><th>Req BNB</th><th>Status</th></tr></thead>
                  <tbody>
                    {fourMemeExecutionPlan.rows.slice(0, 12).map((row) => (
                      <tr key={row.walletId}>
                        <td>{row.index}</td>
                        <td>{row.walletLabel}<span className="muted"> // {shortAddress(row.walletAddress)}</span></td>
                        <td>{row.primeRank ? `P${row.primeRank}` : '-'}</td>
                        <td>{row.approval.required ? `${row.approvalNonce}->${row.tradeNonce}` : row.tradeNonce}</td>
                        <td>{row.gas.totalGasUnits ?? 'n/a'}</td>
                        <td>{numberFmt(row.requiredNativeBNB)}</td>
                        <td>{row.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <small>{[fourMemeExecutionPlan.blockReason, ...fourMemeExecutionPlan.warnings].join(' // ')}</small>
            </div>
          )}
          {executionPlanReview && (
            <div className="tx-preview">
              <strong>Review final // {executionPlanReview.changed ? 'DIFF' : 'OK'} // saved {shortHash(executionPlanReview.savedHash)} // live {shortHash(executionPlanReview.liveHash)}</strong>
              <span>blockedForBroadcast={String(executionPlanReview.blockedForBroadcast)} // broadcast={String(executionPlanReview.broadcast)} // {executionPlanReview.reviewedAt}</span>
              <div className="button-row">
                <button className="ghost" disabled={busy} onClick={() => void run(() => openFinalConfirmation(executionPlanReview.id))}>Final gate</button>
              </div>
              {executionPlanReview.diff.length ? (
                <div className="table-wrap mini-table">
                  <table>
                    <thead><tr><th>Sev</th><th>Path</th><th>Before</th><th>After</th></tr></thead>
                    <tbody>
                      {executionPlanReview.diff.slice(0, 12).map((diff) => (
                        <tr key={diff.path}>
                          <td>{diff.severity}</td>
                          <td><code>{diff.path}</code></td>
                          <td><code>{compactJson(diff.before).slice(0, 80)}</code></td>
                          <td><code>{compactJson(diff.after).slice(0, 80)}</code></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <small>Sem mudanca entre plano salvo e estado live.</small>}
            </div>
          )}
          {finalConfirmation && (
            <div className="tx-preview">
              <strong>Final confirmation // {finalConfirmation.status} // realMode={String(finalConfirmation.realModeEnabled)} // broadcast={String(finalConfirmation.broadcast)}</strong>
              <span>
                futureReady={String(finalConfirmation.readyForFutureRealMode)} //
                phrase={finalConfirmation.phraseAccepted ? 'ok' : 'pending'} //
                block={finalConfirmation.blockReason}
              </span>
              <code>{finalConfirmation.requiredPhrase}</code>
              <div className="control-grid">
                <label className="wide">Digite a frase exata<input value={finalConfirmationText} onChange={(event) => setFinalConfirmationText(event.target.value)} /></label>
                <label className="wide">Nota local<input value={finalOperatorNote} onChange={(event) => setFinalOperatorNote(event.target.value)} placeholder="opcional" /></label>
              </div>
              <div className="button-row">
                <button className="ghost" disabled={busy || !finalConfirmationText} onClick={() => void run(submitFinalConfirmation)}>Confirmar lock</button>
                <button className="ghost" disabled={busy} onClick={() => void navigator.clipboard.writeText(finalConfirmation.requiredPhrase)}>Copiar frase</button>
              </div>
              <div className="table-wrap mini-table">
                <table>
                  <thead><tr><th>Check</th><th>Valor</th></tr></thead>
                  <tbody>
                    {Object.entries(finalConfirmation.checks).map(([key, value]) => (
                      <tr key={key}>
                        <td>{key}</td>
                        <td><code>{String(value)}</code></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <small>{finalConfirmation.blockingReasons.join(' // ')}</small>
            </div>
          )}
          {savedExecutionPlans.length > 0 && (
            <div className="tx-preview">
              <strong>Saved execution plans // {savedExecutionPlans.length}</strong>
              <div className="table-wrap mini-table">
                <table>
                  <thead><tr><th>Hash</th><th>Side</th><th>Wallets</th><th>Req</th><th>Status</th><th>Acoes</th></tr></thead>
                  <tbody>
                    {savedExecutionPlans.slice(0, 8).map((plan) => {
                      const totals = plan.plan.totals && typeof plan.plan.totals === 'object' && !Array.isArray(plan.plan.totals)
                        ? plan.plan.totals as Record<string, unknown>
                        : {};
                      return (
                        <tr key={plan.id}>
                          <td><code title={plan.planHash}>{shortHash(plan.planHash)}</code></td>
                          <td>{plan.side}</td>
                          <td>{String(plan.plan.walletCount ?? 'n/a')}</td>
                          <td>{String(totals.requiredNativeBNB ?? 'n/a')} BNB</td>
                          <td>{plan.status}</td>
                          <td>
                            <button className="ghost" disabled={busy || plan.status === 'archived'} onClick={() => void run(() => reviewExecutionPlan(plan.id))}>Review</button>
                            <button className="ghost" disabled={busy || plan.status === 'archived'} onClick={() => void run(() => openFinalConfirmation(plan.id))}>Final</button>
                            <button className="ghost" disabled={busy || plan.status === 'archived'} onClick={() => void run(() => archiveExecutionPlan(plan.id))}>Archive</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <small>Review recalcula nonce/gas/saldo/calldata contra RPC live antes de qualquer modo real futuro.</small>
            </div>
          )}
        </section>
      )}

      {bag && (
        <section className="preview launch-bag">
          <h2>Token bag // {bag.rows.length} wallets // {bag.node}</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Address</th>
                  <th>Prime</th>
                  <th>Label</th>
                  <th>Token balance</th>
                  <th>Token USD</th>
                  <th>Cost basis</th>
                  <th>PnL</th>
                  <th>BNB</th>
                </tr>
              </thead>
              <tbody>
                {bag.rows.map((row) => (
                  <tr key={row.walletId}>
                    <td><code title={row.address}>{row.address}</code></td>
                    <td>{row.primeRank ? <span className="prime-badge">P{row.primeRank}</span> : '-'}</td>
                    <td>{row.walletLabel}</td>
                    <td>{numberFmt(row.tokenBalance)} {bag.tokenSymbol}</td>
                    <td>{row.tokenUsdValue === null ? 'n/a' : usdFmt(row.tokenUsdValue)}</td>
                    <td>{row.plannedCostUsd === null ? 'n/a' : usdFmt(row.plannedCostUsd)}</td>
                    <td><span className={row.pnlUsd !== null && row.pnlUsd >= 0 ? 'pnl-ok' : 'pnl-bad'}>{row.pnlUsd === null ? 'n/a' : usdFmt(row.pnlUsd)}</span></td>
                    <td>{numberFmt(row.bnbBalance)} BNB</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {positionSummaries.length > 0 && (
        <section className="preview launch-bag">
          <div className="section-head">
            <div>
              <h2><TrendingUp size={17} /> Position ledger // {positionSummaries.length} wallets</h2>
              <p className="muted">cost basis vem de fills/lotes; bag live continua lendo saldo on-chain.</p>
            </div>
            <button className="ghost" disabled={busy || !tokenAddress} onClick={() => void run(refreshPositions)}><RefreshCw size={15} /> Sync</button>
          </div>
          <div className="bag-metrics">
            <div><strong>{usdFmt(ledgerTotals.invested)}</strong><span>invested</span></div>
            <div><strong>{usdFmt(ledgerTotals.sold)}</strong><span>sold</span></div>
            <div><strong className={ledgerTotals.realized >= 0 ? 'pnl-ok' : 'pnl-bad'}>{usdFmt(ledgerTotals.realized)}</strong><span>realized</span></div>
            <div><strong>{usdFmt(ledgerTotals.current)}</strong><span>bag USD</span></div>
            <div><strong className={ledgerTotals.unrealized >= 0 ? 'pnl-ok' : 'pnl-bad'}>{usdFmt(ledgerTotals.unrealized)}</strong><span>unrealized</span></div>
            <div><strong className={ledgerTotals.total >= 0 ? 'pnl-ok' : 'pnl-bad'}>{usdFmt(ledgerTotals.total)}</strong><span>total PnL</span></div>
            <div><strong>{usdFmt(ledgerTotals.pending)}</strong><span>pending planned</span></div>
          </div>
          {ledgerPrimeRows.length > 0 && (
            <div className="prime-ranking">
              <h2><Crown size={15} /> PRIME ledger // sell priority</h2>
              {ledgerPrimeRows.map((row, index) => (
                <div key={row.walletId} className="prime-rank-row">
                  <strong>SELL #{index + 1}</strong>
                  <span>P{row.primeRank} {row.walletLabel}</span>
                  <span>{row.totalPnlUsd === null ? 'PnL n/a' : usdFmt(row.totalPnlUsd)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Prime</th>
                  <th>Wallet</th>
                  <th>Token</th>
                  <th>Buys/Sells</th>
                  <th>Invested</th>
                  <th>Sold</th>
                  <th>Realized</th>
                  <th>Bag USD</th>
                  <th>Total PnL</th>
                </tr>
              </thead>
              <tbody>
                {positionSummaries.map((row) => (
                  <tr key={`${row.walletId}-${row.tokenAddress}`}>
                    <td>{row.primeRank ? <span className="prime-badge">P{row.primeRank}</span> : '-'}</td>
                    <td>{row.walletLabel}<span className="muted"> // {shortAddress(row.walletAddress)}</span></td>
                    <td>{row.tokenSymbol}<span className="muted"> // {row.currentBalance ? numberFmt(row.currentBalance) : 'no bag'}</span></td>
                    <td>{row.buyCount}/{row.sellCount}</td>
                    <td>{usdFmt(row.investedUsd)}</td>
                    <td>{usdFmt(row.soldUsd)}</td>
                    <td><span className={row.realizedPnlUsd >= 0 ? 'pnl-ok' : 'pnl-bad'}>{usdFmt(row.realizedPnlUsd)}</span></td>
                    <td>{row.currentUsdValue === null ? 'n/a' : usdFmt(row.currentUsdValue)}</td>
                    <td><span className={row.totalPnlUsd !== null && row.totalPnlUsd >= 0 ? 'pnl-ok' : 'pnl-bad'}>{row.totalPnlUsd === null ? 'n/a' : usdFmt(row.totalPnlUsd)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {positionFills.length > 0 && (
            <div className="table-wrap compact-table">
              <table>
                <thead><tr><th>Fill</th><th>Wallet</th><th>Side</th><th>Source</th><th>BNB</th><th>Value</th><th>Realized</th><th>When</th></tr></thead>
                <tbody>
                  {positionFills.slice(0, 12).map((fill) => (
                    <tr key={fill.id}>
                      <td><code>{fill.id.slice(0, 13)}</code></td>
                      <td>{fill.walletLabel}</td>
                      <td>{fill.side}</td>
                      <td>{fill.source} // {fill.status}</td>
                      <td>{fill.bnbAmount ?? '-'}</td>
                      <td>{fill.valueUsd === null ? 'n/a' : usdFmt(fill.valueUsd)}</td>
                      <td>{fill.realizedPnlUsd === null ? '-' : usdFmt(fill.realizedPnlUsd)}</td>
                      <td>{new Date(fill.createdAt).toLocaleTimeString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {showAmountModal && queue && (
        <div className="modal-backdrop" role="presentation">
          <section className="modal amount-modal" role="dialog" aria-modal="true">
            <div className="section-head">
              <div>
                <h2><SlidersHorizontal size={17} /> Fixed/manual por wallet</h2>
                <p className="muted">Edite a compra de cada wallet. PRIME fica no topo e compra antes.</p>
              </div>
              <button type="button" className="ghost" onClick={() => setShowAmountModal(false)}>Fechar</button>
            </div>
            <div className="button-row modal-tools">
              <button type="button" onClick={applySameAmount}>Aplicar default {amountBnb}</button>
              <button type="button" onClick={randomizeAmounts}>Random {minAmountBnb}-{maxAmountBnb}</button>
              <button type="button" onClick={applyBalancePercent}>{balancePercent}% saldo</button>
              <button type="button" onClick={() => void run(() => generateQueue(true))}>Recalcular</button>
            </div>
            <div className="table-wrap modal-table">
              <table>
                <thead><tr><th>Prime</th><th>Alias</th><th>Label</th><th>Address</th><th>Saldo</th><th>BNB buy</th><th>USD</th></tr></thead>
                <tbody>
                  {queue.queue.map((item) => (
                    <tr key={item.walletId}>
                      <td>{item.primeRank ? <span className="prime-badge">P{item.primeRank}</span> : '-'}</td>
                      <td>{item.groupAlias}</td>
                      <td>{item.walletLabel}</td>
                      <td><code title={item.address}>{shortAddress(item.address)}</code></td>
                      <td>{numberFmt(item.currentBalanceBNB)} BNB</td>
                      <td><input className="amount-cell-input" value={walletAmounts[item.walletId] ?? item.amountBNB} onChange={(event) => setWalletAmounts((current) => ({ ...current, [item.walletId]: event.target.value }))} /></td>
                      <td>{queue.bnbPriceUsd ? usdFmt(Number(walletAmounts[item.walletId] ?? item.amountBNB) * queue.bnbPriceUsd) : 'n/a'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function BnbView({ groups, busy, run }: { groups: GroupRecord[]; busy: boolean; run: (action: () => Promise<void>) => Promise<void> }) {
  const [groupId, setGroupId] = useState('');
  const [toAddress, setToAddress] = useState('');
  const [amountBnb, setAmountBnb] = useState('0.001');
  const [plan, setPlan] = useState<BnbPlan | null>(null);
  const selectedGroup = groupId || groups[0]?.id || '';

  return (
    <>
      <form className="single-form" onSubmit={(event) => {
        event.preventDefault();
        void run(async () => {
          const result = await api<BnbPlan>('/api/plans/bnb-transfer', {
            method: 'POST',
            body: JSON.stringify({ groupId: selectedGroup, toAddress, amountBnb })
          });
          setPlan(result);
        });
      }}>
        <h2><Send size={17} /> BNB dry-run</h2>
        <label>Grupo<select value={selectedGroup} onChange={(event) => setGroupId(event.target.value)}>
          {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
        </select></label>
        <label>Destino<input value={toAddress} onChange={(event) => setToAddress(event.target.value)} placeholder="0x..." required /></label>
        <label>BNB por wallet<input value={amountBnb} onChange={(event) => setAmountBnb(event.target.value)} /></label>
        <button disabled={busy || !selectedGroup}><Send size={16} /> Gerar plano</button>
      </form>
      {plan && (
        <section className="preview">
          <h2>Dry-run: {plan.transfers.length} transfers</h2>
          <p className="muted">Node: {plan.node} // Gas: {plan.estimatedGasCostWei} wei // no broadcast</p>
          <div className="table-wrap">
            <table>
              <thead><tr><th>From</th><th>To</th><th>Valor</th><th>Saldo</th><th>Status</th></tr></thead>
              <tbody>
                {plan.transfers.map((transfer) => (
                  <tr key={transfer.fromAddress}>
                    <td>{shortAddress(transfer.fromAddress)}</td>
                    <td>{shortAddress(transfer.toAddress)}</td>
                    <td>{transfer.valueBNB} BNB</td>
                    <td>{numberFmt(transfer.currentBalanceBNB)} BNB</td>
                    <td><span className={`badge ${transfer.canAfford ? 'available' : 'archived'}`}>{transfer.canAfford ? 'ok' : transfer.reason}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
