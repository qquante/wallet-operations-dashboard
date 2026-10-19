import { getAddress, formatEther } from 'ethers';
import type { BuneDb } from './db.js';
import type { EventBus } from './events.js';
import { makeId } from './time.js';
import type { GroupRecord, WalletRecord } from './types.js';

function cleanTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return [...new Set(tags.map(String).map((tag) => tag.trim()).filter(Boolean))];
}

export class GroupService {
  constructor(private readonly db: BuneDb, private readonly events: EventBus) {}

  create(input: {
    name: string;
    campaignName?: string;
    tokenAddress?: string;
    fourMemeTokenId?: string;
    fourMemeStatus?: string;
    tags?: string[];
  }): GroupRecord {
    if (!input.name?.trim()) throw new Error('group_name_required');
    const tokenAddress = input.tokenAddress?.trim() ? getAddress(input.tokenAddress) : null;
    const group = this.db.createGroup({
      id: makeId('grp'),
      name: input.name.trim(),
      campaignName: input.campaignName?.trim() || null,
      tokenAddress,
      fourMemeTokenId: input.fourMemeTokenId?.trim() || null,
      fourMemeStatus: input.fourMemeStatus?.trim() || null,
      tags: cleanTags(input.tags)
    });
    this.events.emitEvent({
      type: 'groups.created',
      severity: 'info',
      message: `Grupo criado: ${group.name}`,
      metadata: { groupId: group.id }
    });
    return group;
  }

  list(): GroupRecord[] {
    return this.db.listGroups();
  }

  pullWallets(input: {
    groupId: string;
    count: number;
    tags?: string[];
    minBalanceWei?: string;
    preview?: boolean;
  }): { preview: boolean; wallets: WalletRecord[] } {
    const group = this.db.groupById(input.groupId);
    if (!group || group.status !== 'active') throw new Error('group_not_active');
    const count = Number(input.count);
    if (!Number.isInteger(count) || count < 1 || count > 500) throw new Error('wallet_pull_count_1_500');
    const wallets = this.db.selectAvailableWallets({
      count,
      tags: cleanTags(input.tags),
      minBalanceWei: input.minBalanceWei
    });
    if (input.preview) {
      return { preview: true, wallets };
    }
    const reserved = this.db.reserveWallets(input.groupId, wallets.map((wallet) => wallet.id));
    this.events.emitEvent({
      type: 'groups.wallets_reserved',
      severity: 'info',
      message: `Reservadas ${wallets.length} wallets para ${group.name}`,
      metadata: { groupId: input.groupId, count: wallets.length }
    });
    return { preview: false, wallets: reserved };
  }

  releaseWallets(groupId: string, walletIds?: string[]): { released: number } {
    const group = this.db.groupById(groupId);
    if (!group) throw new Error('group_not_found');
    const released = this.db.releaseWallets(groupId, walletIds);
    this.events.emitEvent({
      type: 'groups.wallets_released',
      severity: 'info',
      message: `Liberadas ${released} wallets de ${group.name}`,
      metadata: { groupId, released }
    });
    return { released };
  }

  groupWallets(groupId: string): WalletRecord[] {
    return this.db.listWallets({ groupId });
  }

  groupBalanceSummary(groupId: string): { walletCount: number; totalBalanceWei: string; totalBalanceBNB: string } {
    const wallets = this.groupWallets(groupId);
    const total = wallets.reduce((sum, wallet) => sum + BigInt(wallet.balanceWei), 0n);
    return {
      walletCount: wallets.length,
      totalBalanceWei: total.toString(),
      totalBalanceBNB: formatEther(total)
    };
  }
}
