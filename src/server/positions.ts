import { getAddress, parseEther } from 'ethers';
import type { BuneDb } from './db.js';
import type { EventBus } from './events.js';
import type {
  PositionFillRecord,
  PositionFillSide,
  PositionFillSource,
  PositionFillStatus,
  PositionSummaryRecord
} from './types.js';

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function optionalPositiveNumber(value: unknown, field: string): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${field}_must_be_positive`);
  return number;
}

function optionalAmountString(value: unknown, field: string): string | null {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).trim();
  const number = Number(text);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${field}_must_be_positive`);
  return text;
}

function decimalString(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0';
  return Number(value.toFixed(18)).toString();
}

export interface PositionFillInput {
  walletId: string;
  tokenId?: string | null;
  tokenAddress?: string | null;
  tokenSymbol?: string | null;
  side: PositionFillSide;
  status?: PositionFillStatus;
  source?: PositionFillSource;
  quantityRaw?: string | null;
  quantityTokens?: string | null;
  tokenDecimals?: number;
  priceUsd?: number | null;
  valueUsd?: number | null;
  bnbAmount?: string | null;
  bnbPriceUsd?: number | null;
  txHash?: string | null;
  groupId?: string | null;
  campaignName?: string | null;
  launchDraftId?: string | null;
  taskId?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
}

export interface PositionFillConfirmInput {
  quantityRaw?: string | null;
  quantityTokens?: string | null;
  tokenDecimals?: number;
  priceUsd?: number | null;
  valueUsd?: number | null;
  bnbAmount?: string | null;
  bnbPriceUsd?: number | null;
  txHash: string;
  source?: PositionFillSource;
  notes?: string | null;
  metadata?: Record<string, unknown>;
}

export class PositionService {
  constructor(
    private readonly db: BuneDb,
    private readonly events: EventBus
  ) {}

  recordFill(input: PositionFillInput): PositionFillRecord {
    const wallet = this.db.walletById(input.walletId);
    if (!wallet) throw new Error('wallet_not_found');
    const token = input.tokenId ? this.db.terminalTokenById(input.tokenId) : null;
    if (input.tokenId && !token) throw new Error('terminal_token_not_found');
    const tokenAddress = getAddress(clean(input.tokenAddress || token?.tokenAddress));
    const group = input.groupId
      ? this.db.groupById(input.groupId)
      : token?.groupId
        ? this.db.groupById(token.groupId)
        : wallet.activeGroupId
          ? this.db.groupById(wallet.activeGroupId)
          : null;
    if (input.groupId && !group) throw new Error('group_not_found');

    const tokenSymbol = clean(input.tokenSymbol || token?.symbol || 'TOKEN').toUpperCase();
    const status = input.status ?? 'planned';
    const source = input.source ?? 'manual';
    const quantityTokens = optionalAmountString(input.quantityTokens, 'quantity_tokens');
    const priceUsd = optionalPositiveNumber(input.priceUsd, 'price_usd');
    const explicitValueUsd = optionalPositiveNumber(input.valueUsd, 'value_usd');
    const bnbAmount = optionalAmountString(input.bnbAmount, 'bnb_amount');
    const bnbPriceUsd = optionalPositiveNumber(input.bnbPriceUsd, 'bnb_price_usd');
    const valueUsd = explicitValueUsd
      ?? (quantityTokens && priceUsd ? Number(quantityTokens) * priceUsd : null)
      ?? (bnbAmount && bnbPriceUsd ? Number(bnbAmount) * bnbPriceUsd : null);
    const bnbAmountWei = bnbAmount ? parseEther(bnbAmount).toString() : null;

    if (input.side === 'sell' && !quantityTokens) throw new Error('sell_quantity_tokens_required');

    let fill = this.db.insertPositionFill({
      walletId: wallet.id,
      tokenId: token?.id ?? null,
      tokenAddress,
      tokenSymbol,
      side: input.side,
      status,
      source,
      quantityRaw: clean(input.quantityRaw) || null,
      quantityTokens,
      tokenDecimals: input.tokenDecimals ?? 18,
      priceUsd,
      valueUsd,
      costBasisUsd: input.side === 'buy' ? valueUsd : null,
      realizedPnlUsd: input.side === 'sell' ? 0 : null,
      bnbAmountWei,
      bnbAmount,
      bnbPriceUsd,
      txHash: clean(input.txHash) || null,
      groupId: group?.id ?? null,
      campaignName: clean(input.campaignName) || token?.campaignName || group?.campaignName || null,
      launchDraftId: clean(input.launchDraftId) || token?.launchDraftId || null,
      taskId: clean(input.taskId) || null,
      notes: clean(input.notes) || null,
      metadata: input.metadata ?? {}
    });

    if (status !== 'cancelled') {
      if (input.side === 'buy' && quantityTokens && valueUsd !== null) {
        this.db.insertPositionLot({
          walletId: wallet.id,
          tokenId: token?.id ?? null,
          tokenAddress,
          tokenSymbol,
          sourceFillId: fill.id,
          openedQuantityTokens: quantityTokens,
          openQuantityTokens: quantityTokens,
          costBasisUsd: valueUsd
        });
      }
      if (input.side === 'sell' && quantityTokens && valueUsd !== null) {
        fill = this.applySellAccounting(fill.id, wallet.id, tokenAddress, Number(quantityTokens), valueUsd);
      }
    }

    this.db.addWalletHistory({
      walletId: wallet.id,
      type: `position_${input.side}_${source}`,
      groupId: group?.id ?? null,
      tokenAddress,
      tokenSymbol,
      campaignName: fill.campaignName,
      amountWei: bnbAmountWei,
      amountBNB: bnbAmount,
      status,
      notes: fill.notes,
      metadata: {
        fillId: fill.id,
        tokenId: token?.id ?? null,
        quantityTokens,
        priceUsd,
        valueUsd,
        costBasisUsd: fill.costBasisUsd,
        realizedPnlUsd: fill.realizedPnlUsd,
        txHash: fill.txHash
      }
    });

    if (token?.id) this.db.refreshTerminalTokenAccounting(token.id);
    this.events.emitEvent({
      type: 'position.fill_recorded',
      severity: 'info',
      message: `${input.side.toUpperCase()} ${tokenSymbol} registrado para ${wallet.label}`,
      metadata: {
        fillId: fill.id,
        walletId: wallet.id,
        tokenAddress,
        side: fill.side,
        status: fill.status,
        source: fill.source,
        valueUsd: fill.valueUsd,
        realizedPnlUsd: fill.realizedPnlUsd,
        broadcast: false
      }
    });
    return fill;
  }

  recordBulk(input: { fills: PositionFillInput[] }): { created: number; fills: PositionFillRecord[] } {
    if (input.fills.length > 500) throw new Error('position_bulk_max_500');
    const fills = input.fills.map((fill) => this.recordFill(fill));
    return { created: fills.length, fills };
  }

  confirmFill(id: string, input: PositionFillConfirmInput): PositionFillRecord {
    const existing = this.db.positionFillById(id);
    if (!existing) throw new Error('position_fill_not_found');
    if (existing.status === 'confirmed') throw new Error('position_fill_already_confirmed');
    if (existing.status === 'cancelled') throw new Error('position_fill_cancelled');

    const txHash = clean(input.txHash || existing.txHash);
    if (!txHash) throw new Error('tx_hash_required');
    const quantityTokens = optionalAmountString(input.quantityTokens ?? existing.quantityTokens, 'quantity_tokens');
    if (!quantityTokens) throw new Error('quantity_tokens_required');

    const priceUsd = optionalPositiveNumber(input.priceUsd ?? existing.priceUsd, 'price_usd');
    const bnbAmount = optionalAmountString(input.bnbAmount ?? existing.bnbAmount, 'bnb_amount');
    const bnbPriceUsd = optionalPositiveNumber(input.bnbPriceUsd ?? existing.bnbPriceUsd, 'bnb_price_usd');
    const explicitValueUsd = optionalPositiveNumber(input.valueUsd ?? existing.valueUsd, 'value_usd');
    const valueUsd = explicitValueUsd
      ?? (priceUsd ? Number(quantityTokens) * priceUsd : null)
      ?? (bnbAmount && bnbPriceUsd ? Number(bnbAmount) * bnbPriceUsd : null);
    if (valueUsd === null) throw new Error('value_usd_required');

    const existingLot = existing.side === 'buy' ? this.db.positionLotBySourceFillId(existing.id) : null;
    if (existingLot) {
      const opened = Number(existingLot.openedQuantityTokens);
      const open = Number(existingLot.openQuantityTokens);
      if (Number.isFinite(opened) && Number.isFinite(open) && Math.abs(opened - open) > 1e-12) {
        throw new Error('position_lot_already_partially_consumed');
      }
    }

    const bnbAmountWei = bnbAmount ? parseEther(bnbAmount).toString() : existing.bnbAmountWei;
    let fill = this.db.updatePositionFill(id, {
      status: 'confirmed',
      source: input.source ?? 'onchain',
      quantityRaw: clean(input.quantityRaw ?? existing.quantityRaw) || null,
      quantityTokens,
      tokenDecimals: input.tokenDecimals ?? existing.tokenDecimals,
      priceUsd,
      valueUsd,
      costBasisUsd: existing.side === 'buy' ? valueUsd : 0,
      realizedPnlUsd: existing.side === 'sell' ? 0 : null,
      bnbAmountWei,
      bnbAmount,
      bnbPriceUsd,
      txHash,
      notes: clean(input.notes) || existing.notes,
      metadata: {
        ...existing.metadata,
        ...(input.metadata ?? {}),
        matchedFromStatus: existing.status,
        confirmedAt: new Date().toISOString()
      }
    });

    if (existing.side === 'buy') {
      if (existingLot) {
        this.db.updatePositionLot(existingLot.id, {
          openedQuantityTokens: quantityTokens,
          openQuantityTokens: quantityTokens,
          costBasisUsd: valueUsd,
          status: 'open'
        });
      } else {
        this.db.insertPositionLot({
          walletId: fill.walletId,
          tokenId: fill.tokenId,
          tokenAddress: fill.tokenAddress,
          tokenSymbol: fill.tokenSymbol,
          sourceFillId: fill.id,
          openedQuantityTokens: quantityTokens,
          openQuantityTokens: quantityTokens,
          costBasisUsd: valueUsd
        });
      }
      fill = this.db.updatePositionFillAccounting(fill.id, {
        costBasisUsd: valueUsd,
        realizedPnlUsd: null
      });
    } else {
      fill = this.applySellAccounting(fill.id, fill.walletId, fill.tokenAddress, Number(quantityTokens), valueUsd);
    }

    this.db.addWalletHistory({
      walletId: fill.walletId,
      type: `position_${fill.side}_confirmed`,
      groupId: fill.groupId,
      tokenAddress: fill.tokenAddress,
      tokenSymbol: fill.tokenSymbol,
      campaignName: fill.campaignName,
      amountWei: fill.bnbAmountWei,
      amountBNB: fill.bnbAmount,
      status: 'confirmed',
      notes: fill.notes,
      metadata: {
        fillId: fill.id,
        matchedFromStatus: existing.status,
        quantityTokens,
        valueUsd,
        costBasisUsd: fill.costBasisUsd,
        realizedPnlUsd: fill.realizedPnlUsd,
        txHash
      }
    });
    if (fill.tokenId) this.db.refreshTerminalTokenAccounting(fill.tokenId);
    this.events.emitEvent({
      type: 'position.fill_confirmed',
      severity: 'info',
      message: `Fill confirmado: ${fill.tokenSymbol} ${fill.side} ${fill.walletLabel}`,
      metadata: {
        fillId: fill.id,
        walletId: fill.walletId,
        tokenAddress: fill.tokenAddress,
        txHash,
        side: fill.side,
        valueUsd,
        realizedPnlUsd: fill.realizedPnlUsd,
        broadcast: false
      }
    });
    return fill;
  }

  listFills(filters: {
    walletId?: string;
    tokenId?: string;
    tokenAddress?: string;
    groupId?: string;
    status?: string;
    source?: string;
    limit?: number;
  }): PositionFillRecord[] {
    return this.db.listPositionFills(filters);
  }

  summaries(filters: {
    walletId?: string;
    tokenId?: string;
    tokenAddress?: string;
    groupId?: string;
    primeOnly?: boolean;
    limit?: number;
  }): PositionSummaryRecord[] {
    return this.db.listPositionSummaries(filters);
  }

  private applySellAccounting(
    fillId: string,
    walletId: string,
    tokenAddress: string,
    quantityTokens: number,
    sellValueUsd: number
  ): PositionFillRecord {
    let remaining = quantityTokens;
    let consumedCostBasisUsd = 0;
    const lots = this.db.listOpenPositionLots(walletId, tokenAddress);
    for (const lot of lots) {
      if (remaining <= 0) break;
      const open = Number(lot.openQuantityTokens);
      if (!Number.isFinite(open) || open <= 0) continue;
      const consume = Math.min(open, remaining);
      const ratio = consume / open;
      const cost = lot.costBasisUsd * ratio;
      consumedCostBasisUsd += cost;
      const nextOpen = open - consume;
      const nextCost = Math.max(lot.costBasisUsd - cost, 0);
      this.db.updatePositionLot(lot.id, {
        openQuantityTokens: decimalString(nextOpen),
        costBasisUsd: nextOpen <= 1e-12 ? 0 : nextCost,
        status: nextOpen <= 1e-12 ? 'closed' : 'open'
      });
      remaining -= consume;
    }
    return this.db.updatePositionFillAccounting(fillId, {
      costBasisUsd: consumedCostBasisUsd,
      realizedPnlUsd: sellValueUsd - consumedCostBasisUsd
    });
  }
}
