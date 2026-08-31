import { existsSync } from 'node:fs';
import path from 'node:path';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import Fastify from 'fastify';
import { z } from 'zod';
import type { BuneDb } from './db.js';
import { EventBus } from './events.js';
import { WalletService } from './walletService.js';
import { GroupService } from './groupService.js';
import { BscNodePool } from './nodes.js';
import { BalanceService } from './balances.js';
import { BnbPlanService } from './plans.js';
import { MarketService } from './market.js';
import { LaunchService } from './launch.js';
import { LaunchDraftService } from './launchDrafts.js';
import { TokenBagService } from './tokenBags.js';
import { FourMemeService } from './fourMeme.js';
import { FourMemeExecutionPlanner, type FourMemeExecutionPlan } from './fourMemeExecutionPlanner.js';
import { FourMemeTradeService } from './fourMemeTrade.js';
import { ExecutionPlanStoreService } from './executionPlanStore.js';
import { TerminalService } from './terminal.js';
import { PositionService } from './positions.js';
import { TxParserService } from './txParser.js';

const generateSchema = z.object({
  count: z.number().int().min(1).max(500),
  labelPrefix: z.string().optional(),
  tags: z.array(z.string()).optional()
});
const importSchema = z.object({
  text: z.string().optional(),
  csv: z.string().optional(),
  tags: z.array(z.string()).optional()
});
const watchOnlyWalletSchema = z.object({
  address: z.string().min(1),
  label: z.string().optional(),
  tags: z.array(z.string()).optional()
});
const exportSchema = z.object({
  walletIds: z.array(z.string()).optional(),
  groupId: z.string().optional()
});
const legacyMigrationSchema = z.object({ password: z.string().min(1) });
const primeRankSchema = z.object({
  primeRank: z.number().int().min(1).max(5).nullable()
});
const devWalletSchema = z.object({
  devRank: z.number().int().min(1).max(20).nullable(),
  devRole: z.string().optional().nullable(),
  devNotes: z.string().optional().nullable()
});
const walletTagsSchema = z.object({
  set: z.array(z.string()).optional(),
  add: z.array(z.string()).optional(),
  remove: z.array(z.string()).optional()
});
const walletLabelSchema = z.object({
  label: z.string().min(1)
});
const walletRelabelSchema = z.object({
  walletIds: z.array(z.string()).optional(),
  tag: z.string().optional(),
  prefix: z.string().min(1),
  startAt: z.number().int().min(1).optional()
});
const groupSchema = z.object({
  name: z.string().min(1),
  campaignName: z.string().optional(),
  tokenAddress: z.string().optional(),
  fourMemeTokenId: z.string().optional(),
  fourMemeStatus: z.string().optional(),
  tags: z.array(z.string()).optional()
});
const pullSchema = z.object({
  count: z.number().int().min(1).max(500),
  tags: z.array(z.string()).optional(),
  minBalanceWei: z.string().optional(),
  preview: z.boolean().optional()
});
const releaseSchema = z.object({ walletIds: z.array(z.string()).optional() });
const balanceSchema = z.object({
  walletIds: z.array(z.string()).optional(),
  groupId: z.string().optional(),
  all: z.boolean().optional()
});
const bnbPlanSchema = z.object({
  groupId: z.string().optional(),
  walletIds: z.array(z.string()).optional(),
  toAddress: z.string().min(1),
  amountBnb: z.string().min(1)
});
const launchDryRunSchema = z.object({
  groupId: z.string().min(1).optional(),
  groupIds: z.array(z.string().min(1)).optional(),
  tokenAddress: z.string().min(1),
  campaignName: z.string().optional(),
  amountMode: z.enum(['fixed', 'random_range', 'percent_balance', 'per_wallet']).optional(),
  amountBnb: z.string().optional(),
  minAmountBnb: z.string().optional(),
  maxAmountBnb: z.string().optional(),
  balancePercent: z.string().optional(),
  walletAmounts: z.record(z.string(), z.string()).optional(),
  maxWallets: z.number().int().min(1).max(500).optional(),
  devWalletId: z.string().optional()
});
const tokenBagSchema = z.object({
  groupId: z.string().optional(),
  groupIds: z.array(z.string()).optional(),
  walletIds: z.array(z.string()).optional(),
  tokenAddress: z.string().min(1),
  costBnbPerWallet: z.string().optional(),
  walletCostBnb: z.record(z.string(), z.string()).optional()
});
const fourMemeSearchSchema = z.object({
  type: z.string().optional(),
  listType: z.string().optional(),
  status: z.string().optional(),
  sort: z.string().optional(),
  symbol: z.string().optional(),
  version: z.string().optional(),
  keyword: z.string().optional(),
  pageIndex: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional()
});
const fourMemeLaunchDraftSchema = z.object({
  name: z.string().min(1),
  shortName: z.string().min(1),
  desc: z.string().min(1),
  imgUrl: z.string().optional(),
  label: z.string().optional(),
  webUrl: z.string().optional(),
  twitterUrl: z.string().optional(),
  telegramUrl: z.string().optional(),
  raisedSymbol: z.string().optional(),
  preSale: z.string().optional(),
  onlyMPC: z.boolean().optional(),
  feePlan: z.boolean().optional(),
  launchTime: z.number().optional()
});
const launchDraftCreateSchema = fourMemeLaunchDraftSchema.extend({
  campaignName: z.string().optional(),
  groupIds: z.array(z.string()).optional(),
  devWalletId: z.string().optional(),
  tokenAddress: z.string().optional(),
  imageFilePath: z.string().optional()
});
const terminalTriggerSchema = z.enum(['manual', 'delay', 'market_cap', 'profit', 'price', 'bonding_curve']);
const terminalTaskKindSchema = z.enum([
  'four_meme_create',
  'first_buy',
  'sell_prime',
  'bulk_sell',
  'volume',
  'bump',
  'sell_buyback',
  'fund',
  'withdraw',
  'collect_fees',
  'warm'
]);
const objectSchema = z.record(z.string(), z.unknown());
const objectArraySchema = z.array(objectSchema);
const terminalCampaignCreateSchema = z.object({
  name: z.string().min(1),
  groupIds: z.array(z.string()).optional(),
  devWalletIds: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  metadata: objectSchema.optional()
});
const terminalTokenCreateSchema = z.object({
  name: z.string().min(1),
  symbol: z.string().min(1),
  tokenAddress: z.string().optional().nullable(),
  launchpad: z.string().optional(),
  chainId: z.number().int().optional(),
  status: z.enum(['draft', 'pre_launch', 'live', 'archived']).optional(),
  campaignId: z.string().optional().nullable(),
  campaignName: z.string().optional().nullable(),
  groupId: z.string().optional().nullable(),
  devWalletId: z.string().optional().nullable(),
  launchDraftId: z.string().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  metadata: objectSchema.optional()
});
const terminalTaskCreateSchema = z.object({
  tokenId: z.string().optional().nullable(),
  name: z.string().min(1),
  kind: terminalTaskKindSchema,
  triggerType: terminalTriggerSchema.optional(),
  triggerValue: z.string().optional().nullable(),
  walletIds: z.array(z.string()).optional(),
  groupId: z.string().optional().nullable(),
  params: objectSchema.optional()
});
const terminalAutomationCreateSchema = z.object({
  tokenId: z.string().optional().nullable(),
  name: z.string().min(1),
  triggerType: terminalTriggerSchema,
  triggerValue: z.string().optional().nullable(),
  taskIds: z.array(z.string()).optional()
});
const blueprintCreateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  walletSlots: objectArraySchema.optional(),
  taskTemplates: objectArraySchema.optional(),
  settings: objectSchema.optional()
});
const appSettingSchema = z.object({
  key: z.string().min(1),
  value: z.string()
});
const positionFillSchema = z.object({
  walletId: z.string().min(1),
  tokenId: z.string().optional().nullable(),
  tokenAddress: z.string().optional().nullable(),
  tokenSymbol: z.string().optional().nullable(),
  side: z.enum(['buy', 'sell']),
  status: z.enum(['planned', 'simulated', 'confirmed', 'cancelled']).optional(),
  source: z.enum(['launch_dry_run', 'task_dry_run', 'manual', 'onchain', 'imported']).optional(),
  quantityRaw: z.string().optional().nullable(),
  quantityTokens: z.string().optional().nullable(),
  tokenDecimals: z.number().int().min(0).max(255).optional(),
  priceUsd: z.number().positive().optional().nullable(),
  valueUsd: z.number().positive().optional().nullable(),
  bnbAmount: z.string().optional().nullable(),
  bnbPriceUsd: z.number().positive().optional().nullable(),
  txHash: z.string().optional().nullable(),
  groupId: z.string().optional().nullable(),
  campaignName: z.string().optional().nullable(),
  launchDraftId: z.string().optional().nullable(),
  taskId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  metadata: objectSchema.optional()
});
const positionFillBulkSchema = z.object({
  fills: z.array(positionFillSchema).min(1).max(500)
});
const positionFillConfirmSchema = z.object({
  quantityRaw: z.string().optional().nullable(),
  quantityTokens: z.string().optional().nullable(),
  tokenDecimals: z.number().int().min(0).max(255).optional(),
  priceUsd: z.number().positive().optional().nullable(),
  valueUsd: z.number().positive().optional().nullable(),
  bnbAmount: z.string().optional().nullable(),
  bnbPriceUsd: z.number().positive().optional().nullable(),
  txHash: z.string().min(1),
  source: z.enum(['launch_dry_run', 'task_dry_run', 'manual', 'onchain', 'imported']).optional(),
  notes: z.string().optional().nullable(),
  metadata: objectSchema.optional()
});
const txPreviewSchema = z.object({
  txHash: z.string().min(1),
  fillId: z.string().optional(),
  walletId: z.string().optional(),
  walletAddress: z.string().optional(),
  tokenAddress: z.string().optional(),
  side: z.enum(['buy', 'sell']).optional()
});
const fourMemeTradeDryRunSchema = z.object({
  tokenAddress: z.string().min(1),
  side: z.enum(['buy', 'sell']),
  walletId: z.string().optional(),
  walletAddress: z.string().optional(),
  buyMode: z.enum(['funds', 'amount']).optional(),
  fundsWei: z.string().optional(),
  fundsBnb: z.string().optional(),
  amountWei: z.string().optional(),
  maxFundsWei: z.string().optional(),
  minAmountWei: z.string().optional(),
  minFundsWei: z.string().optional(),
  slippageBps: z.number().int().min(0).max(5000).optional()
});
const fourMemeExecutionPlanSchema = z.object({
  tokenAddress: z.string().min(1),
  side: z.enum(['buy', 'sell']),
  groupId: z.string().optional(),
  groupIds: z.array(z.string()).optional(),
  walletIds: z.array(z.string()).optional(),
  maxWallets: z.number().int().min(1).max(500).optional(),
  buyMode: z.enum(['funds', 'amount']).optional(),
  fundsBnb: z.string().optional(),
  walletFundsBnb: z.record(z.string(), z.string()).optional(),
  amountWei: z.string().optional(),
  walletAmountWei: z.record(z.string(), z.string()).optional(),
  slippageBps: z.number().int().min(0).max(5000).optional(),
  walletSlippageBps: z.record(z.string(), z.number().int().min(0).max(5000)).optional(),
  order: z.enum(['prime_first', 'pnl_first', 'input']).optional()
});
const executionPlanSaveSchema = z.object({
  plan: objectSchema
});
const executionPlanFinalConfirmationSchema = z.object({
  confirmationText: z.string(),
  operatorNote: z.string().optional().nullable()
});

export interface AppServices {
  events: EventBus;
  wallets: WalletService;
  groups: GroupService;
  nodes: BscNodePool;
  balances: BalanceService;
  plans: BnbPlanService;
  market: MarketService;
  launch: LaunchService;
  launchDrafts: LaunchDraftService;
  tokenBags: TokenBagService;
  fourMeme: FourMemeService;
  fourMemeTrade: FourMemeTradeService;
  fourMemeExecutionPlanner: FourMemeExecutionPlanner;
  executionPlanStore: ExecutionPlanStoreService;
  terminal: TerminalService;
  positions: PositionService;
  txParser: TxParserService;
}

export function createServices(db: BuneDb): AppServices {
  const events = new EventBus(db);
  const wallets = new WalletService(db, events);
  const groups = new GroupService(db, events);
  const nodes = new BscNodePool();
  const balances = new BalanceService(db, nodes, events);
  const plans = new BnbPlanService(db, nodes, events);
  const market = new MarketService(events, db);
  const launch = new LaunchService(db, market, events);
  const tokenBags = new TokenBagService(db, nodes, market, events);
  const fourMeme = new FourMemeService(events);
  const fourMemeTrade = new FourMemeTradeService(db, nodes, market, events);
  const fourMemeExecutionPlanner = new FourMemeExecutionPlanner(db, nodes, fourMemeTrade, events);
  const executionPlanStore = new ExecutionPlanStoreService(db, fourMemeExecutionPlanner, events);
  const launchDrafts = new LaunchDraftService(db, fourMeme, events);
  const terminal = new TerminalService(db, events);
  const positions = new PositionService(db, events);
  const txParser = new TxParserService(db, nodes, market);
  return { events, wallets, groups, nodes, balances, plans, market, launch, launchDrafts, tokenBags, fourMeme, fourMemeTrade, fourMemeExecutionPlanner, executionPlanStore, terminal, positions, txParser };
}

export async function createApp(db: BuneDb) {
  const services = createServices(db);
  const app = Fastify({ logger: true });

  await app.register(cors, {
    origin: ['http://127.0.0.1:8789', 'http://localhost:8789']
  });
  await app.register(websocket);

  app.setErrorHandler((error, _request, reply) => {
    const err = error instanceof Error ? error : new Error('unknown_error');
    const validation = (error as { validation?: unknown }).validation;
    const statusCode = validation ? 400 : err.message.startsWith('Converta ') ? 409 : 500;
    services.events.emitEvent({
      type: 'api.error',
      severity: 'error',
      message: err.message,
      metadata: { statusCode }
    });
    reply.status(statusCode).send({ error: err.message });
  });

  app.get('/api/health', async () => ({
    ok: true,
    chainId: 56,
    storageMode: 'local_plaintext',
    legacyEncryptedKeys: services.wallets.legacyKeySummary().encrypted
  }));

  app.post('/api/wallets/generate', async (request) => services.wallets.generate(generateSchema.parse(request.body)));
  app.post('/api/wallets/import', async (request) => services.wallets.import(importSchema.parse(request.body)));
  app.post('/api/wallets/watch-only', async (request) => services.wallets.watchOnly(watchOnlyWalletSchema.parse(request.body)));
  app.get('/api/wallets', async (request) => {
    const query = request.query as { groupId?: string; status?: string; tag?: string; search?: string };
    return services.wallets.list(query);
  });
  app.get('/api/dev-wallets', async () => services.wallets.listDevWallets());
  app.get('/api/wallet-history', async (request) => {
    const query = request.query as { walletId?: string; groupId?: string; tokenAddress?: string; limit?: string };
    return services.wallets.history({
      walletId: query.walletId,
      groupId: query.groupId,
      tokenAddress: query.tokenAddress,
      limit: Number(query.limit ?? 120)
    });
  });
  app.get('/api/wallet-token-positions', async (request) => {
    const query = request.query as { walletId?: string; groupId?: string; tokenAddress?: string };
    return services.wallets.tokenPositions(query);
  });
  app.get('/api/positions/fills', async (request) => {
    const query = request.query as {
      walletId?: string;
      tokenId?: string;
      tokenAddress?: string;
      groupId?: string;
      status?: string;
      source?: string;
      limit?: string;
    };
    return services.positions.listFills({
      walletId: query.walletId,
      tokenId: query.tokenId,
      tokenAddress: query.tokenAddress,
      groupId: query.groupId,
      status: query.status,
      source: query.source,
      limit: Number(query.limit ?? 300)
    });
  });
  app.post('/api/positions/fills', async (request) => services.positions.recordFill(positionFillSchema.parse(request.body)));
  app.post('/api/positions/fills/bulk', async (request) => services.positions.recordBulk(positionFillBulkSchema.parse(request.body)));
  app.post('/api/positions/fills/:id/confirm', async (request) => {
    const params = request.params as { id: string };
    return services.positions.confirmFill(params.id, positionFillConfirmSchema.parse(request.body));
  });
  app.get('/api/positions/summary', async (request) => {
    const query = request.query as {
      walletId?: string;
      tokenId?: string;
      tokenAddress?: string;
      groupId?: string;
      primeOnly?: string;
      limit?: string;
    };
    return services.positions.summaries({
      walletId: query.walletId,
      tokenId: query.tokenId,
      tokenAddress: query.tokenAddress,
      groupId: query.groupId,
      primeOnly: query.primeOnly === 'true',
      limit: Number(query.limit ?? 300)
    });
  });
  app.post('/api/wallets/export-csv', async (request, reply) => {
    const csv = services.wallets.exportCsv(exportSchema.parse(request.body));
    reply.header('content-type', 'text/csv; charset=utf-8');
    reply.header('content-disposition', `attachment; filename="bune-wallets-${Date.now()}.csv"`);
    return csv;
  });
  app.get('/api/wallets/legacy-key-summary', async () => services.wallets.legacyKeySummary());
  app.post('/api/wallets/:id/prime', async (request) => {
    const params = request.params as { id: string };
    const body = primeRankSchema.parse(request.body);
    return services.wallets.setPrimeRank(params.id, body.primeRank);
  });
  app.post('/api/wallets/:id/dev', async (request) => {
    const params = request.params as { id: string };
    const body = devWalletSchema.parse(request.body);
    return services.wallets.setDevConfig({
      walletId: params.id,
      devRank: body.devRank,
      devRole: body.devRole,
      devNotes: body.devNotes
    });
  });
  app.post('/api/wallets/:id/tags', async (request) => {
    const params = request.params as { id: string };
    const body = walletTagsSchema.parse(request.body);
    return services.wallets.updateTags({ walletId: params.id, ...body });
  });
  app.post('/api/wallets/migrate-legacy-keys', async (request) => {
    const body = legacyMigrationSchema.parse(request.body);
    return services.wallets.migrateLegacyEncryptedKeys(body.password);
  });
  app.post('/api/wallets/relabel', async (request) => services.wallets.relabel(walletRelabelSchema.parse(request.body)));
  app.post('/api/wallets/:id/label', async (request) => {
    const params = request.params as { id: string };
    const body = walletLabelSchema.parse(request.body);
    return services.wallets.updateLabel({ walletId: params.id, label: body.label });
  });

  app.post('/api/groups', async (request) => services.groups.create(groupSchema.parse(request.body)));
  app.get('/api/groups', async () => services.groups.list());
  app.get('/api/groups/:id/wallets', async (request) => {
    const params = request.params as { id: string };
    return services.groups.groupWallets(params.id);
  });
  app.post('/api/groups/:id/pull-wallets', async (request) => {
    const params = request.params as { id: string };
    return services.groups.pullWallets({ groupId: params.id, ...pullSchema.parse(request.body) });
  });
  app.post('/api/groups/:id/release-wallets', async (request) => {
    const params = request.params as { id: string };
    return services.groups.releaseWallets(params.id, releaseSchema.parse(request.body).walletIds);
  });

  app.get('/api/nodes/status', async () => {
    const nodes = await services.nodes.healthyWsNodes();
    return { healthy: nodes.length, nodes: nodes.slice(0, 10) };
  });
  app.post('/api/balances/refresh', async (request) => services.balances.refresh(balanceSchema.parse(request.body)));
  app.get('/api/market/bnb-price', async () => services.market.bnbPrice());
  app.get('/api/market/bnb-price-at', async (request) => {
    const query = request.query as { timestamp?: string };
    const timestamp = Number(query.timestamp);
    if (!Number.isFinite(timestamp) || timestamp <= 0) throw new Error('timestamp_required');
    return services.market.bnbPriceAt(timestamp);
  });
  app.get('/api/market/token-price/:address', async (request) => {
    const params = request.params as { address: string };
    return services.market.tokenPrice(params.address);
  });
  app.get('/api/market/token-price/:address/snapshots', async (request) => {
    const params = request.params as { address: string };
    const query = request.query as { limit?: string };
    return db.listTokenPriceSnapshots(params.address, Number(query.limit ?? 100));
  });
  app.post('/api/tx/preview', async (request) => services.txParser.preview(txPreviewSchema.parse(request.body)));
  app.get('/api/four-meme/config', async () => services.fourMeme.config());
  app.get('/api/four-meme/token/:address', async (request) => {
    const params = request.params as { address: string };
    return services.fourMeme.tokenDetail(params.address);
  });
  app.post('/api/four-meme/search', async (request) => services.fourMeme.search(fourMemeSearchSchema.parse(request.body)));
  app.post('/api/four-meme/launch-draft', async (request) => services.fourMeme.launchDraft(fourMemeLaunchDraftSchema.parse(request.body)));
  app.post('/api/four-meme/trade-dry-run', async (request) => services.fourMemeTrade.tradeDryRun(fourMemeTradeDryRunSchema.parse(request.body)));
  app.post('/api/four-meme/execution-plan', async (request) => services.fourMemeExecutionPlanner.plan(fourMemeExecutionPlanSchema.parse(request.body)));
  app.get('/api/four-meme/execution-plans', async (request) => {
    const query = request.query as { tokenAddress?: string; status?: string; limit?: string };
    return services.executionPlanStore.list({
      tokenAddress: query.tokenAddress,
      status: query.status,
      limit: Number(query.limit ?? 50)
    });
  });
  app.post('/api/four-meme/execution-plans', async (request) => {
    const body = executionPlanSaveSchema.parse(request.body);
    return services.executionPlanStore.save(body.plan as unknown as FourMemeExecutionPlan);
  });
  app.get('/api/four-meme/execution-plans/:id', async (request) => {
    const params = request.params as { id: string };
    return services.executionPlanStore.byId(params.id);
  });
  app.post('/api/four-meme/execution-plans/:id/review', async (request) => {
    const params = request.params as { id: string };
    return services.executionPlanStore.review(params.id);
  });
  app.get('/api/four-meme/execution-plans/:id/final-confirmation', async (request) => {
    const params = request.params as { id: string };
    return services.executionPlanStore.finalConfirmationDraft(params.id);
  });
  app.post('/api/four-meme/execution-plans/:id/final-confirmation', async (request) => {
    const params = request.params as { id: string };
    return services.executionPlanStore.confirmFinal(params.id, executionPlanFinalConfirmationSchema.parse(request.body));
  });
  app.post('/api/four-meme/execution-plans/:id/archive', async (request) => {
    const params = request.params as { id: string };
    return services.executionPlanStore.archive(params.id);
  });
  app.get('/api/launch-drafts', async (request) => {
    const query = request.query as { status?: string; groupId?: string; campaignName?: string; limit?: string };
    return services.launchDrafts.list({
      status: query.status,
      groupId: query.groupId,
      campaignName: query.campaignName,
      limit: Number(query.limit ?? 100)
    });
  });
  app.get('/api/launch-drafts/:id', async (request) => {
    const params = request.params as { id: string };
    return services.launchDrafts.byId(params.id);
  });
  app.post('/api/launch-drafts', async (request) => services.launchDrafts.create(launchDraftCreateSchema.parse(request.body)));
  app.post('/api/launch-drafts/:id/prepare-create-dry-run', async (request) => {
    const params = request.params as { id: string };
    return services.launchDrafts.prepareCreateDryRun(params.id);
  });
  app.post('/api/launch-drafts/:id/archive', async (request) => {
    const params = request.params as { id: string };
    return services.launchDrafts.archive(params.id);
  });
  app.post('/api/launch/first-buys-dry-run', async (request) => services.launch.firstBuysDryRun(launchDryRunSchema.parse(request.body)));
  app.post('/api/token-bags/refresh', async (request) => services.tokenBags.refresh(tokenBagSchema.parse(request.body)));

  app.get('/api/terminal/campaigns', async (request) => {
    const query = request.query as { status?: string; limit?: string };
    return services.terminal.listCampaigns({ status: query.status, limit: Number(query.limit ?? 100) });
  });
  app.post('/api/terminal/campaigns', async (request) => services.terminal.createCampaign(terminalCampaignCreateSchema.parse(request.body)));
  app.post('/api/terminal/campaigns/:id/archive', async (request) => {
    const params = request.params as { id: string };
    return services.terminal.archiveCampaign(params.id);
  });
  app.get('/api/terminal/tokens', async (request) => {
    const query = request.query as { status?: string; campaignId?: string; launchpad?: string; limit?: string };
    return services.terminal.listTokens({
      status: query.status,
      campaignId: query.campaignId,
      launchpad: query.launchpad,
      limit: Number(query.limit ?? 150)
    });
  });
  app.post('/api/terminal/tokens', async (request) => services.terminal.createToken(terminalTokenCreateSchema.parse(request.body)));
  app.post('/api/terminal/tokens/:id/archive', async (request) => {
    const params = request.params as { id: string };
    return services.terminal.archiveToken(params.id);
  });
  app.get('/api/terminal/tasks', async (request) => {
    const query = request.query as { tokenId?: string; status?: string; limit?: string };
    return services.terminal.listTasks({ tokenId: query.tokenId, status: query.status, limit: Number(query.limit ?? 150) });
  });
  app.post('/api/terminal/tasks', async (request) => services.terminal.createTask(terminalTaskCreateSchema.parse(request.body)));
  app.post('/api/terminal/tasks/:id/prepare-dry-run', async (request) => {
    const params = request.params as { id: string };
    return services.terminal.prepareTaskDryRun(params.id);
  });
  app.post('/api/terminal/tasks/:id/cancel', async (request) => {
    const params = request.params as { id: string };
    return services.terminal.cancelTask(params.id);
  });
  app.get('/api/terminal/automations', async (request) => {
    const query = request.query as { status?: string; tokenId?: string; limit?: string };
    return services.terminal.listAutomations({ status: query.status, tokenId: query.tokenId, limit: Number(query.limit ?? 150) });
  });
  app.post('/api/terminal/automations', async (request) => services.terminal.createAutomation(terminalAutomationCreateSchema.parse(request.body)));
  app.post('/api/terminal/automations/:id/archive', async (request) => {
    const params = request.params as { id: string };
    return services.terminal.archiveAutomation(params.id);
  });
  app.get('/api/terminal/blueprints', async (request) => {
    const query = request.query as { status?: string; limit?: string };
    return services.terminal.listBlueprints({ status: query.status, limit: Number(query.limit ?? 100) });
  });
  app.post('/api/terminal/blueprints', async (request) => services.terminal.createBlueprint(blueprintCreateSchema.parse(request.body)));
  app.post('/api/terminal/blueprints/:id/archive', async (request) => {
    const params = request.params as { id: string };
    return services.terminal.archiveBlueprint(params.id);
  });
  app.get('/api/terminal/settings', async () => services.terminal.listSettings());
  app.post('/api/terminal/settings', async (request) => {
    const body = appSettingSchema.parse(request.body);
    return services.terminal.setSetting(body.key, body.value);
  });
  app.post('/api/plans/bnb-transfer', async (request) => services.plans.createTransferPlan(bnbPlanSchema.parse(request.body)));
  app.get('/api/events', async (request) => {
    const query = request.query as { limit?: string };
    return db.listEvents(Number(query.limit ?? 100));
  });

  app.get('/ws/live', { websocket: true }, (socket) => {
    socket.send(JSON.stringify({
      type: 'hello',
      event: {
        id: 'hello',
        type: 'socket.connected',
        severity: 'info',
        message: 'Conectado ao live feed Bune',
        metadata: {},
        createdAt: new Date().toISOString()
      }
    }));
    const off = services.events.onEvent((event) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify({ type: 'event', event }));
    });
    socket.on('close', off);
  });

  const staticRoot = path.join(process.cwd(), 'dist', 'client');
  if (existsSync(staticRoot)) {
    await app.register(fastifyStatic, { root: staticRoot });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api') || request.url.startsWith('/ws')) {
        reply.status(404).send({ error: 'not_found' });
        return;
      }
      reply.sendFile('index.html');
    });
  }

  return { app, services };
}
