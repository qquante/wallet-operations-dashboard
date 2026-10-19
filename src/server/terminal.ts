import { getAddress } from 'ethers';
import type { BuneDb } from './db.js';
import type { EventBus } from './events.js';
import { makeId } from './time.js';
import type {
  AppSettingRecord,
  BlueprintRecord,
  TerminalAutomationRecord,
  TerminalCampaignRecord,
  TerminalTaskKind,
  TerminalTaskRecord,
  TerminalTokenRecord,
  WalletRecord
} from './types.js';

const TASK_KINDS = new Set<TerminalTaskKind>([
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

const TOKEN_TASKS = new Set<TerminalTaskKind>([
  'four_meme_create',
  'first_buy',
  'sell_prime',
  'bulk_sell',
  'volume',
  'bump',
  'sell_buyback'
]);

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function unique(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => clean(value)).filter(Boolean))];
}

function optionalAddress(address: string | undefined | null): string | null {
  const value = clean(address);
  return value ? getAddress(value) : null;
}

function sortWalletsForLaunch(wallets: WalletRecord[]): WalletRecord[] {
  return [...wallets].sort((a, b) => {
    const aPrime = a.primeRank ?? 999;
    const bPrime = b.primeRank ?? 999;
    if (aPrime !== bPrime) return aPrime - bPrime;
    const aDev = a.devRank ?? 999;
    const bDev = b.devRank ?? 999;
    if (aDev !== bDev) return aDev - bDev;
    const balanceDiff = BigInt(b.balanceWei) - BigInt(a.balanceWei);
    if (balanceDiff > 0n) return 1;
    if (balanceDiff < 0n) return -1;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export interface TerminalTaskDryRunPlan {
  dryRunOnly: true;
  broadcastBlocked: true;
  taskId: string;
  kind: TerminalTaskKind;
  taskStatus: 'dry_run_ready';
  token: {
    id: string;
    name: string;
    symbol: string;
    tokenAddress: string | null;
    launchpad: string;
  } | null;
  group: {
    id: string;
    name: string;
  } | null;
  trigger: {
    type: string;
    value: string | null;
  };
  params: Record<string, unknown>;
  checks: {
    tokenRequired: boolean;
    tokenLinked: boolean;
    tokenAddressKnown: boolean;
    walletCount: number;
    hasWallets: boolean;
    groupLinked: boolean;
    canBroadcast: false;
    broadcastBlockReason: string;
  };
  queue: Array<{
    index: number;
    walletId: string;
    walletLabel: string;
    address: string;
    primeRank: number | null;
    devRank: number | null;
    tags: string[];
    status: string;
    balanceBNB: string;
    plannedAction: TerminalTaskKind;
    params: Record<string, unknown>;
  }>;
  warnings: string[];
  note: string;
}

export class TerminalService {
  constructor(
    private readonly db: BuneDb,
    private readonly events: EventBus
  ) {}

  createCampaign(input: {
    name: string;
    groupIds?: string[];
    devWalletIds?: string[];
    tags?: string[];
    metadata?: Record<string, unknown>;
  }): TerminalCampaignRecord {
    const groupIds = unique(input.groupIds);
    const devWalletIds = unique(input.devWalletIds);
    for (const groupId of groupIds) {
      if (!this.db.groupById(groupId)) throw new Error(`group_not_found_${groupId}`);
    }
    for (const walletId of devWalletIds) {
      const wallet = this.db.walletById(walletId);
      if (!wallet) throw new Error(`dev_wallet_not_found_${walletId}`);
      if (wallet.devRank === null) throw new Error(`wallet_not_configured_as_dev_${walletId}`);
    }
    const campaign = this.db.insertTerminalCampaign({
      id: makeId('cmp'),
      name: clean(input.name),
      groupIds,
      devWalletIds,
      tags: unique(input.tags),
      metadata: input.metadata ?? {}
    });
    this.events.emitEvent({
      type: 'terminal.campaign_created',
      severity: 'info',
      message: `Campaign criada: ${campaign.name}`,
      metadata: { campaignId: campaign.id, groupIds, devWalletIds }
    });
    return campaign;
  }

  listCampaigns(filters: { status?: string; limit?: number } = {}): TerminalCampaignRecord[] {
    return this.db.listTerminalCampaigns(filters);
  }

  archiveCampaign(id: string): TerminalCampaignRecord {
    const campaign = this.db.updateTerminalCampaignStatus(id, 'archived');
    this.events.emitEvent({
      type: 'terminal.campaign_archived',
      severity: 'info',
      message: `Campaign arquivada: ${campaign.name}`,
      metadata: { campaignId: campaign.id }
    });
    return campaign;
  }

  createToken(input: {
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
    const campaign = input.campaignId ? this.requireCampaign(input.campaignId) : null;
    if (input.groupId && !this.db.groupById(input.groupId)) throw new Error('group_not_found');
    if (input.devWalletId) this.requireWallet(input.devWalletId);
    if (input.launchDraftId && !this.db.launchDraftById(input.launchDraftId)) throw new Error('launch_draft_not_found');
    const chainId = input.chainId ?? 56;
    if (chainId !== 56) throw new Error('terminal_token_chainId_must_be_56');
    const token = this.db.insertTerminalToken({
      id: makeId('tok'),
      name: clean(input.name),
      symbol: clean(input.symbol).toUpperCase(),
      tokenAddress: optionalAddress(input.tokenAddress),
      launchpad: clean(input.launchpad) || 'four_meme',
      chainId,
      status: input.status ?? 'draft',
      campaignId: campaign?.id ?? null,
      campaignName: clean(input.campaignName) || campaign?.name || null,
      groupId: input.groupId || null,
      devWalletId: input.devWalletId || null,
      launchDraftId: input.launchDraftId || null,
      imageUrl: clean(input.imageUrl) || null,
      tags: unique(input.tags),
      metadata: input.metadata ?? {}
    });
    this.events.emitEvent({
      type: 'terminal.token_created',
      severity: 'info',
      message: `Token registrado: ${token.symbol}`,
      metadata: { tokenId: token.id, campaignId: token.campaignId, tokenAddress: token.tokenAddress, dryRunOnly: true }
    });
    return token;
  }

  listTokens(filters: { status?: string; campaignId?: string; launchpad?: string; limit?: number } = {}): TerminalTokenRecord[] {
    return this.db.listTerminalTokens(filters);
  }

  archiveToken(id: string): TerminalTokenRecord {
    const token = this.db.updateTerminalTokenStatus(id, 'archived');
    this.events.emitEvent({
      type: 'terminal.token_archived',
      severity: 'info',
      message: `Token arquivado: ${token.symbol}`,
      metadata: { tokenId: token.id }
    });
    return token;
  }

  createTask(input: {
    tokenId?: string | null;
    name: string;
    kind: TerminalTaskKind;
    triggerType?: TerminalTaskRecord['triggerType'];
    triggerValue?: string | null;
    walletIds?: string[];
    groupId?: string | null;
    params?: Record<string, unknown>;
  }): TerminalTaskRecord {
    if (!TASK_KINDS.has(input.kind)) throw new Error('terminal_task_kind_invalid');
    if (TOKEN_TASKS.has(input.kind) && !input.tokenId) throw new Error('terminal_task_token_required');
    if (input.tokenId) this.requireToken(input.tokenId);
    if (input.groupId && !this.db.groupById(input.groupId)) throw new Error('group_not_found');
    const walletIds = unique(input.walletIds);
    for (const walletId of walletIds) this.requireWallet(walletId);
    const task = this.db.insertTerminalTask({
      id: makeId('tsk'),
      tokenId: input.tokenId || null,
      name: clean(input.name),
      kind: input.kind,
      triggerType: input.triggerType ?? 'manual',
      triggerValue: clean(input.triggerValue) || null,
      walletIds,
      groupId: input.groupId || null,
      params: input.params ?? {}
    });
    for (const walletId of walletIds) {
      this.db.addWalletHistory({
        walletId,
        type: `task_${task.kind}_created`,
        groupId: task.groupId,
        tokenSymbol: task.tokenSymbol,
        campaignName: task.tokenName,
        status: 'dry_run',
        metadata: { taskId: task.id, dryRunOnly: true }
      });
    }
    this.events.emitEvent({
      type: 'terminal.task_created',
      severity: 'info',
      message: `Task criada: ${task.name}`,
      metadata: { taskId: task.id, kind: task.kind, dryRunOnly: true }
    });
    return task;
  }

  listTasks(filters: { tokenId?: string; status?: string; limit?: number } = {}): TerminalTaskRecord[] {
    return this.db.listTerminalTasks(filters);
  }

  prepareTaskDryRun(id: string): TerminalTaskRecord {
    const task = this.requireTask(id);
    const plan = this.buildTaskPlan(task);
    const updated = this.db.updateTerminalTaskPlan(id, {
      status: 'dry_run_ready',
      dryRunPlan: plan as unknown as Record<string, unknown>,
      lastError: null
    });
    this.events.emitEvent({
      type: 'terminal.task_dry_run_prepared',
      severity: 'info',
      message: `Task dry-run pronta: ${task.name}`,
      metadata: { taskId: task.id, kind: task.kind, queue: plan.queue.length, broadcastBlocked: true }
    });
    return updated;
  }

  cancelTask(id: string): TerminalTaskRecord {
    const task = this.db.updateTerminalTaskPlan(id, { status: 'cancelled' });
    this.events.emitEvent({
      type: 'terminal.task_cancelled',
      severity: 'info',
      message: `Task cancelada: ${task.name}`,
      metadata: { taskId: task.id }
    });
    return task;
  }

  createAutomation(input: {
    tokenId?: string | null;
    name: string;
    triggerType: TerminalAutomationRecord['triggerType'];
    triggerValue?: string | null;
    taskIds?: string[];
  }): TerminalAutomationRecord {
    if (input.tokenId) this.requireToken(input.tokenId);
    const taskIds = unique(input.taskIds);
    for (const taskId of taskIds) this.requireTask(taskId);
    const automation = this.db.insertTerminalAutomation({
      id: makeId('aut'),
      tokenId: input.tokenId || null,
      name: clean(input.name),
      triggerType: input.triggerType,
      triggerValue: clean(input.triggerValue) || null,
      taskIds
    });
    this.events.emitEvent({
      type: 'terminal.automation_created',
      severity: 'info',
      message: `Automation criada: ${automation.name}`,
      metadata: { automationId: automation.id, dryRunOnly: true, taskIds }
    });
    return automation;
  }

  listAutomations(filters: { status?: string; tokenId?: string; limit?: number } = {}): TerminalAutomationRecord[] {
    return this.db.listTerminalAutomations(filters);
  }

  archiveAutomation(id: string): TerminalAutomationRecord {
    const automation = this.db.updateTerminalAutomationStatus(id, 'archived');
    this.events.emitEvent({
      type: 'terminal.automation_archived',
      severity: 'info',
      message: `Automation arquivada: ${automation.name}`,
      metadata: { automationId: automation.id }
    });
    return automation;
  }

  createBlueprint(input: {
    name: string;
    description?: string | null;
    walletSlots?: Array<Record<string, unknown>>;
    taskTemplates?: Array<Record<string, unknown>>;
    settings?: Record<string, unknown>;
  }): BlueprintRecord {
    const blueprint = this.db.insertBlueprint({
      id: makeId('bp'),
      name: clean(input.name),
      description: clean(input.description) || null,
      walletSlots: input.walletSlots ?? [],
      taskTemplates: input.taskTemplates ?? [],
      settings: input.settings ?? {}
    });
    this.events.emitEvent({
      type: 'terminal.blueprint_created',
      severity: 'info',
      message: `Blueprint criado: ${blueprint.name}`,
      metadata: { blueprintId: blueprint.id }
    });
    return blueprint;
  }

  listBlueprints(filters: { status?: string; limit?: number } = {}): BlueprintRecord[] {
    return this.db.listBlueprints(filters);
  }

  archiveBlueprint(id: string): BlueprintRecord {
    const blueprint = this.db.updateBlueprintStatus(id, 'archived');
    this.events.emitEvent({
      type: 'terminal.blueprint_archived',
      severity: 'info',
      message: `Blueprint arquivado: ${blueprint.name}`,
      metadata: { blueprintId: blueprint.id }
    });
    return blueprint;
  }

  setSetting(key: string, value: string): AppSettingRecord {
    const setting = this.db.upsertAppSetting(clean(key), value);
    this.events.emitEvent({
      type: 'terminal.setting_updated',
      severity: 'info',
      message: `Setting atualizada: ${setting.key}`,
      metadata: { key: setting.key }
    });
    return setting;
  }

  listSettings(): AppSettingRecord[] {
    return this.db.listAppSettings();
  }

  private buildTaskPlan(task: TerminalTaskRecord): TerminalTaskDryRunPlan {
    const token = task.tokenId ? this.requireToken(task.tokenId) : null;
    const group = task.groupId ? this.db.groupById(task.groupId) : null;
    const explicitWallets = task.walletIds.map((walletId) => this.db.walletById(walletId)).filter((wallet): wallet is WalletRecord => Boolean(wallet));
    const groupWallets = task.groupId ? this.db.listWallets({ groupId: task.groupId }) : [];
    const wallets = sortWalletsForLaunch([...new Map([...explicitWallets, ...groupWallets].map((wallet) => [wallet.id, wallet])).values()]);
    const tokenRequired = TOKEN_TASKS.has(task.kind);
    const warnings = [
      tokenRequired && !token ? 'token_required' : '',
      tokenRequired && token && !token.tokenAddress && task.kind !== 'four_meme_create' ? 'token_address_missing_for_market_task' : '',
      wallets.length === 0 && task.kind !== 'four_meme_create' ? 'no_wallets_selected' : '',
      task.kind === 'sell_prime' && !wallets.some((wallet) => wallet.primeRank !== null) ? 'sell_prime_without_prime_wallet' : ''
    ].filter(Boolean);
    return {
      dryRunOnly: true,
      broadcastBlocked: true,
      taskId: task.id,
      kind: task.kind,
      taskStatus: 'dry_run_ready',
      token: token ? {
        id: token.id,
        name: token.name,
        symbol: token.symbol,
        tokenAddress: token.tokenAddress,
        launchpad: token.launchpad
      } : null,
      group: group ? { id: group.id, name: group.name } : null,
      trigger: {
        type: task.triggerType,
        value: task.triggerValue
      },
      params: task.params,
      checks: {
        tokenRequired,
        tokenLinked: Boolean(token),
        tokenAddressKnown: Boolean(token?.tokenAddress),
        walletCount: wallets.length,
        hasWallets: wallets.length > 0,
        groupLinked: Boolean(group),
        canBroadcast: false,
        broadcastBlockReason: 'broadcast_disabled_in_v1'
      },
      queue: wallets.map((wallet, index) => ({
        index: index + 1,
        walletId: wallet.id,
        walletLabel: wallet.label,
        address: wallet.address,
        primeRank: wallet.primeRank,
        devRank: wallet.devRank,
        tags: wallet.tags,
        status: wallet.status,
        balanceBNB: wallet.balanceBNB,
        plannedAction: task.kind,
        params: task.params
      })),
      warnings,
      note: 'dry_run_only_no_signature_no_raw_tx_no_broadcast'
    };
  }

  private requireCampaign(id: string): TerminalCampaignRecord {
    const campaign = this.db.terminalCampaignById(id);
    if (!campaign) throw new Error('terminal_campaign_not_found');
    return campaign;
  }

  private requireToken(id: string): TerminalTokenRecord {
    const token = this.db.terminalTokenById(id);
    if (!token) throw new Error('terminal_token_not_found');
    return token;
  }

  private requireTask(id: string): TerminalTaskRecord {
    const task = this.db.terminalTaskById(id);
    if (!task) throw new Error('terminal_task_not_found');
    return task;
  }

  private requireWallet(id: string): WalletRecord {
    const wallet = this.db.walletById(id);
    if (!wallet) throw new Error('wallet_not_found');
    return wallet;
  }
}
