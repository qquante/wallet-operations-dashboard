import { randomInt } from 'node:crypto';
import { formatEther, getAddress, parseEther } from 'ethers';
import type { BuneDb } from './db.js';
import type { EventBus } from './events.js';
import type { MarketService } from './market.js';
import type { GroupRecord, WalletRecord } from './types.js';

export type LaunchAmountMode = 'fixed' | 'random_range' | 'percent_balance' | 'per_wallet';

export interface LaunchDryRunInput {
  groupId?: string;
  groupIds?: string[];
  tokenAddress: string;
  campaignName?: string;
  amountMode?: LaunchAmountMode;
  amountBnb?: string;
  minAmountBnb?: string;
  maxAmountBnb?: string;
  balancePercent?: string;
  walletAmounts?: Record<string, string>;
  maxWallets?: number;
  devWalletId?: string;
}

export interface LaunchDryRunQueueItem {
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
  amountWei: string;
  amountBNB: string;
  plannedCostUsd: number | null;
  currentBalanceWei: string;
  currentBalanceBNB: string;
  canAfford: boolean;
  status: 'queued_dry_run' | 'insufficient_bnb' | 'zero_amount';
  reason: string | null;
}

export interface LaunchDryRunQueue {
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
  queue: LaunchDryRunQueueItem[];
  note: 'dry_run_only_no_signed_tx_no_broadcast';
}

interface WalletWithGroup {
  wallet: WalletRecord;
  group: GroupRecord;
  localIndex: number;
}

function uniq(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function safeTag(prefix: string, value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const clean = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 36);
  return clean ? `${prefix}:${clean}` : null;
}

function parsePositiveBnb(value: string | undefined, field: string): bigint {
  const parsed = parseEther(value || '0');
  if (parsed <= 0n) throw new Error(`${field}_must_be_positive`);
  return parsed;
}

function randomWeiBetween(minWei: bigint, maxWei: bigint): bigint {
  if (maxWei < minWei) throw new Error('max_amount_must_be_gte_min_amount');
  if (maxWei === minWei) return minWei;
  const precision = 1_000_000_000_000n;
  const minUnits = minWei / precision;
  const maxUnits = maxWei / precision;
  if (maxUnits <= minUnits) return minWei;
  return BigInt(randomInt(Number(minUnits), Number(maxUnits) + 1)) * precision;
}

function percentToBps(value: string | undefined): bigint {
  const numeric = Number(value || '0');
  if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 100) {
    throw new Error('balance_percent_must_be_between_0_and_100');
  }
  return BigInt(Math.floor(numeric * 100));
}

export class LaunchService {
  constructor(
    private readonly db: BuneDb,
    private readonly market: MarketService,
    private readonly events: EventBus
  ) {}

  async firstBuysDryRun(input: LaunchDryRunInput): Promise<LaunchDryRunQueue> {
    const groupIds = uniq(input.groupIds?.length ? input.groupIds : input.groupId ? [input.groupId] : []);
    if (!groupIds.length) throw new Error('group_required');
    const groups = groupIds.map((groupId) => this.db.groupById(groupId));
    if (groups.some((group) => !group)) throw new Error('group_not_found');
    const activeGroups = groups as GroupRecord[];
    const tokenAddress = getAddress(input.tokenAddress || activeGroups[0]?.tokenAddress || '');
    const devWallet = input.devWalletId ? this.db.walletById(input.devWalletId) : null;
    if (input.devWalletId && !devWallet) throw new Error('dev_wallet_not_found');
    if (devWallet && devWallet.devRank === null) throw new Error('wallet_not_configured_as_dev');
    const amountMode = input.amountMode ?? 'fixed';
    const maxWallets = Math.min(Math.max(input.maxWallets ?? 50, 1), 500);
    const fixedAmountWei = amountMode === 'fixed' || amountMode === 'per_wallet'
      ? parsePositiveBnb(input.amountBnb, 'amount_bnb')
      : null;
    const minAmountWei = amountMode === 'random_range' ? parsePositiveBnb(input.minAmountBnb, 'min_amount_bnb') : null;
    const maxAmountWei = amountMode === 'random_range' ? parsePositiveBnb(input.maxAmountBnb, 'max_amount_bnb') : null;
    const balanceBps = amountMode === 'percent_balance' ? percentToBps(input.balancePercent) : null;

    const wallets = this.collectWallets(activeGroups).slice(0, maxWallets);
    const bnbPrice = await this.market.bnbPrice().catch(() => null);

    const queue = wallets.map(({ wallet, group, localIndex }, index): LaunchDryRunQueueItem => {
      const current = BigInt(wallet.balanceWei);
      const amountWei = this.amountForWallet({
        wallet,
        current,
        amountMode,
        fixedAmountWei,
        minAmountWei,
        maxAmountWei,
        balanceBps,
        walletAmounts: input.walletAmounts
      });
      const amountBNB = formatEther(amountWei);
      const amountNumber = Number(amountBNB);
      const plannedCostUsd = bnbPrice ? amountNumber * bnbPrice.priceUsd : null;
      const canAfford = amountWei > 0n && current >= amountWei;
      return {
        index: index + 1,
        groupId: group.id,
        groupName: group.name,
        groupAlias: `${group.name}-${String(localIndex + 1).padStart(2, '0')}`,
        walletId: wallet.id,
        walletLabel: wallet.label,
        primeRank: wallet.primeRank,
        address: wallet.address,
        tags: wallet.tags,
        amountMode,
        amountWei: amountWei.toString(),
        amountBNB,
        plannedCostUsd,
        currentBalanceWei: current.toString(),
        currentBalanceBNB: formatEther(current),
        canAfford,
        status: amountWei <= 0n ? 'zero_amount' : canAfford ? 'queued_dry_run' : 'insufficient_bnb',
        reason: amountWei <= 0n ? 'amount_resolved_to_zero' : canAfford ? null : 'insufficient_bnb_for_planned_buy'
      };
    });

    const totalPlannedWei = queue.reduce((sum, item) => sum + BigInt(item.amountWei), 0n);
    const totalPlannedBnb = formatEther(totalPlannedWei);
    const totalPlannedUsd = bnbPrice ? Number(totalPlannedBnb) * bnbPrice.priceUsd : null;
    const plan: LaunchDryRunQueue = {
      dryRunOnly: true,
      chainId: 56,
      groupIds,
      groups: activeGroups.map((group) => ({ id: group.id, name: group.name })),
      devWallet: devWallet ? {
        walletId: devWallet.id,
        label: devWallet.label,
        address: devWallet.address,
        devRank: devWallet.devRank,
        devRole: devWallet.devRole
      } : null,
      tokenAddress,
      campaignName: input.campaignName || activeGroups[0]?.campaignName || null,
      amountMode,
      bnbPriceUsd: bnbPrice?.priceUsd ?? null,
      totalPlannedBnb,
      totalPlannedUsd,
      queue,
      note: 'dry_run_only_no_signed_tx_no_broadcast'
    };

    this.events.emitEvent({
      type: 'launch.first_buys_dry_run',
      severity: 'info',
      message: `Fila dry-run de primeiras compras criada com ${queue.length} wallets`,
      metadata: {
        groupIds,
        devWalletId: devWallet?.id ?? null,
        tokenAddress,
        campaignName: plan.campaignName,
        amountMode,
        count: queue.length,
        dryRunOnly: true
      }
    });

    const launchTags = [
      safeTag('camp', plan.campaignName),
      `token:${tokenAddress.slice(0, 6).toLowerCase()}${tokenAddress.slice(-4).toLowerCase()}`,
      'launch:planned'
    ].filter((tag): tag is string => Boolean(tag));
    this.db.addTagsToWallets(queue.map((item) => item.walletId), launchTags);
    for (const item of queue) {
      this.db.addWalletHistory({
        walletId: item.walletId,
        type: 'launch_first_buy_dry_run',
        groupId: item.groupId,
        tokenAddress,
        campaignName: plan.campaignName,
        amountWei: item.amountWei,
        amountBNB: item.amountBNB,
        status: item.status,
        notes: item.reason,
        metadata: {
          dryRunOnly: true,
          devWalletId: devWallet?.id ?? null,
          primeRank: item.primeRank,
          canAfford: item.canAfford
        }
      });
    }
    if (devWallet) {
      this.db.addWalletHistory({
        walletId: devWallet.id,
        type: 'launch_dev_wallet_selected',
        tokenAddress,
        campaignName: plan.campaignName,
        status: 'planned',
        metadata: { dryRunOnly: true, groupIds, queueWallets: queue.length }
      });
    }

    return plan;
  }

  private collectWallets(groups: GroupRecord[]): WalletWithGroup[] {
    const seen = new Set<string>();
    const rows: WalletWithGroup[] = [];
    for (const group of groups) {
      const groupWallets = this.db.listWallets({ groupId: group.id });
      for (const [localIndex, wallet] of groupWallets.entries()) {
        if (seen.has(wallet.id)) continue;
        seen.add(wallet.id);
        rows.push({ wallet, group, localIndex });
      }
    }
    return rows.sort((a, b) => {
      const primeA = a.wallet.primeRank ?? 999;
      const primeB = b.wallet.primeRank ?? 999;
      if (primeA !== primeB) return primeA - primeB;
      return a.localIndex - b.localIndex;
    });
  }

  private amountForWallet(input: {
    wallet: WalletRecord;
    current: bigint;
    amountMode: LaunchAmountMode;
    fixedAmountWei: bigint | null;
    minAmountWei: bigint | null;
    maxAmountWei: bigint | null;
    balanceBps: bigint | null;
    walletAmounts?: Record<string, string>;
  }): bigint {
    const override = input.walletAmounts?.[input.wallet.id];
    if (override?.trim()) return parsePositiveBnb(override, `wallet_amount_${input.wallet.id}`);
    if (input.amountMode === 'random_range') {
      return randomWeiBetween(input.minAmountWei ?? 0n, input.maxAmountWei ?? 0n);
    }
    if (input.amountMode === 'percent_balance') {
      return input.current * (input.balanceBps ?? 0n) / 10_000n;
    }
    return input.fixedAmountWei ?? 0n;
  }
}
