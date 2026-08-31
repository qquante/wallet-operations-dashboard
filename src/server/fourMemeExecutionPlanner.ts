import { Interface, formatEther, getAddress } from 'ethers';
import type { BuneDb } from './db.js';
import type { EventBus } from './events.js';
import { defaultReaderForUrl, type FourMemeChainReader, type FourMemeTradeDryRun, type FourMemeTradeService } from './fourMemeTrade.js';
import type { BscNodePool } from './nodes.js';
import type { WalletRecord } from './types.js';

const ERC20_IFACE = new Interface(['function approve(address spender, uint256 amount) returns (bool)']);

export interface FourMemeExecutionPlanInput {
  tokenAddress: string;
  side: 'buy' | 'sell';
  groupId?: string;
  groupIds?: string[];
  walletIds?: string[];
  maxWallets?: number;
  buyMode?: 'funds' | 'amount';
  fundsBnb?: string;
  walletFundsBnb?: Record<string, string>;
  amountWei?: string;
  walletAmountWei?: Record<string, string>;
  slippageBps?: number;
  walletSlippageBps?: Record<string, number>;
  order?: 'prime_first' | 'pnl_first' | 'input';
}

export interface FourMemeExecutionPlanRow {
  index: number;
  walletId: string;
  walletLabel: string;
  walletAddress: string;
  primeRank: number | null;
  groupId: string | null;
  side: 'buy' | 'sell';
  slippageBps: number;
  nonceBase: number;
  approvalNonce: number | null;
  tradeNonce: number;
  approval: {
    required: boolean;
    to: string | null;
    spender: string | null;
    amountWei: string | null;
    calldata: string | null;
    gasUnits: string | null;
    error: string | null;
  };
  trade: FourMemeTradeDryRun;
  gas: {
    gasPriceWei: string | null;
    approvalGasUnits: string | null;
    tradeGasUnits: string | null;
    totalGasUnits: string | null;
    totalGasCostWei: string | null;
    totalGasCostBNB: string | null;
  };
  requiredNativeWei: string;
  requiredNativeBNB: string;
  walletBalanceWei: string;
  walletBalanceBNB: string;
  status: 'ready_dry_run' | 'insufficient_bnb' | 'simulation_error' | 'gas_unknown';
  warnings: string[];
}

export interface FourMemeExecutionPlan {
  readOnly: true;
  broadcast: false;
  blockedForBroadcast: true;
  blockReason: 'explicit_real_mode_not_enabled';
  chainId: 56;
  tokenAddress: string;
  side: 'buy' | 'sell';
  request: FourMemeExecutionPlanInput;
  node: string;
  walletCount: number;
  rows: FourMemeExecutionPlanRow[];
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
  note: 'dry_run_only_no_signed_tx_no_broadcast';
}

export class FourMemeExecutionPlanner {
  constructor(
    private readonly db: BuneDb,
    private readonly nodes: BscNodePool,
    private readonly trade: FourMemeTradeService,
    private readonly events: EventBus,
    private readonly readerFactory = defaultReaderForUrl
  ) {}

  async plan(input: FourMemeExecutionPlanInput): Promise<FourMemeExecutionPlan> {
    const urls = [
      ...await this.nodes.bestHttpUrls(2).catch(() => []),
      ...await this.nodes.bestWsUrls(3).catch(() => [])
    ];
    if (!urls.length) throw new Error('no_healthy_bsc_rpc_node');
    let lastError: unknown = null;
    for (const url of urls) {
      const reader = this.readerFactory(url);
      try {
        return await this.planWithReader(reader, url, input);
      } catch (error) {
        lastError = error;
      } finally {
        reader.destroy();
      }
    }
    throw lastError instanceof Error ? lastError : new Error('all_bsc_nodes_failed');
  }

  async planWithReader(reader: FourMemeChainReader, node: string, input: FourMemeExecutionPlanInput): Promise<FourMemeExecutionPlan> {
    const chainId = await reader.chainId();
    if (chainId !== 56n) throw new Error(`wrong_chain_${chainId.toString()}`);
    const tokenAddress = getAddress(input.tokenAddress);
    const request = normalizedRequest(input, tokenAddress);
    const wallets = this.collectWallets(input);
    if (!wallets.length) throw new Error('wallets_required');
    const gasPrice = await reader.gasPrice().catch(() => null);
    const rows: FourMemeExecutionPlanRow[] = [];

    for (const [index, wallet] of wallets.entries()) {
      const slippageBps = clampInt(input.walletSlippageBps?.[wallet.id] ?? input.slippageBps ?? 500, 0, 5000);
      const dryRun = await this.trade.tradeDryRunWithReader(reader, node, {
        tokenAddress,
        side: input.side,
        walletId: wallet.id,
        walletAddress: wallet.address,
        buyMode: input.buyMode ?? 'funds',
        fundsBnb: input.side === 'buy' && (input.buyMode ?? 'funds') !== 'amount'
          ? walletAmount(wallet.id, input.walletFundsBnb, input.fundsBnb, 'funds_bnb_required')
          : undefined,
        amountWei: input.side === 'sell'
          ? walletAmount(wallet.id, input.walletAmountWei, input.amountWei, 'amount_wei_required_for_sell')
          : input.buyMode === 'amount'
            ? walletAmount(wallet.id, input.walletAmountWei, input.amountWei, 'amount_wei_required_for_buy')
            : undefined,
        slippageBps
      });
      const nonceBase = await reader.getTransactionCount(wallet.address).catch(() => 0);
      const approval = await this.approvalPlan(reader, wallet.address, dryRun);
      const tradeGasUnits = dryRun.simulation.estimateGas ? BigInt(dryRun.simulation.estimateGas) : null;
      const approvalGasUnits = approval.gasUnits ? BigInt(approval.gasUnits) : null;
      const totalGasUnits = tradeGasUnits !== null || approvalGasUnits !== null
        ? (tradeGasUnits ?? 0n) + (approvalGasUnits ?? 0n)
        : null;
      const totalGasCostWei = totalGasUnits !== null && gasPrice !== null ? totalGasUnits * gasPrice : null;
      const tradeValueWei = BigInt(dryRun.tx.valueWei || '0');
      const requiredNativeWei = tradeValueWei + (totalGasCostWei ?? 0n);
      const hasSimulationError = dryRun.simulation.errors.length > 0 || approval.error !== null;
      const gasUnknown = totalGasCostWei === null;
      const insufficient = BigInt(wallet.balanceWei || '0') < requiredNativeWei;
      const status: FourMemeExecutionPlanRow['status'] = hasSimulationError
        ? 'simulation_error'
        : gasUnknown
          ? 'gas_unknown'
          : insufficient
            ? 'insufficient_bnb'
            : 'ready_dry_run';
      rows.push({
        index: index + 1,
        walletId: wallet.id,
        walletLabel: wallet.label,
        walletAddress: wallet.address,
        primeRank: wallet.primeRank,
        groupId: wallet.activeGroupId,
        side: input.side,
        slippageBps,
        nonceBase,
        approvalNonce: approval.required ? nonceBase : null,
        tradeNonce: approval.required ? nonceBase + 1 : nonceBase,
        approval,
        trade: dryRun,
        gas: {
          gasPriceWei: gasPrice?.toString() ?? null,
          approvalGasUnits: approval.gasUnits,
          tradeGasUnits: dryRun.simulation.estimateGas,
          totalGasUnits: totalGasUnits?.toString() ?? null,
          totalGasCostWei: totalGasCostWei?.toString() ?? null,
          totalGasCostBNB: totalGasCostWei === null ? null : formatEther(totalGasCostWei)
        },
        requiredNativeWei: requiredNativeWei.toString(),
        requiredNativeBNB: formatEther(requiredNativeWei),
        walletBalanceWei: wallet.balanceWei,
        walletBalanceBNB: wallet.balanceBNB,
        status,
        warnings: [
          ...dryRun.warnings,
          ...dryRun.simulation.errors,
          approval.error ? `approval_estimate_failed:${approval.error}` : '',
          gasUnknown ? 'gas_cost_unknown' : '',
          insufficient ? 'wallet_bnb_below_required_native' : ''
        ].filter(Boolean)
      });
    }

    const totals = summarizeRows(rows);
    const plan: FourMemeExecutionPlan = {
      readOnly: true,
      broadcast: false,
      blockedForBroadcast: true,
      blockReason: 'explicit_real_mode_not_enabled',
      chainId: 56,
      tokenAddress,
      side: input.side,
      request,
      node,
      walletCount: rows.length,
      rows,
      totals,
      warnings: [
        'quotes_are_independent_read_only_not_stateful_curve_sequence',
        'real_mode_blocked_requires_explicit_future_flag'
      ],
      note: 'dry_run_only_no_signed_tx_no_broadcast'
    };
    this.events.emitEvent({
      type: 'four_meme.execution_plan',
      severity: totals.simulationErrors || totals.gasUnknown ? 'warn' : 'info',
      message: `Execution plan ${input.side} ${rows.length} wallets`,
      metadata: {
        tokenAddress,
        side: input.side,
        walletCount: rows.length,
        ready: totals.ready,
        insufficientBnb: totals.insufficientBnb,
        blockedForBroadcast: true,
        broadcast: false
      }
    });
    return plan;
  }

  private collectWallets(input: FourMemeExecutionPlanInput): WalletRecord[] {
    const byId = new Map<string, WalletRecord>();
    for (const walletId of input.walletIds ?? []) {
      const wallet = this.db.walletById(walletId);
      if (wallet) byId.set(wallet.id, wallet);
    }
    const groupIds = [...new Set([...(input.groupIds ?? []), input.groupId ?? ''].filter(Boolean))];
    for (const groupId of groupIds) {
      if (!this.db.groupById(groupId)) throw new Error(`group_not_found_${groupId}`);
      for (const wallet of this.db.listWallets({ groupId })) byId.set(wallet.id, wallet);
    }
    const wallets = [...byId.values()];
    if (input.order === 'input') return wallets.slice(0, clampInt(input.maxWallets ?? 100, 1, 500));
    return wallets
      .sort((a, b) => {
        const primeA = a.primeRank ?? 999;
        const primeB = b.primeRank ?? 999;
        if (primeA !== primeB) return primeA - primeB;
        return a.label.localeCompare(b.label) || a.address.localeCompare(b.address);
      })
      .slice(0, clampInt(input.maxWallets ?? 100, 1, 500));
  }

  private async approvalPlan(reader: FourMemeChainReader, from: string, dryRun: FourMemeTradeDryRun): Promise<FourMemeExecutionPlanRow['approval']> {
    const required = Boolean(dryRun.tx.approvalToken && dryRun.tx.approvalSpender && dryRun.tx.approvalAmountWei && BigInt(dryRun.tx.approvalAmountWei) > 0n);
    if (!required) {
      return { required: false, to: null, spender: null, amountWei: null, calldata: null, gasUnits: null, error: null };
    }
    const to = dryRun.tx.approvalToken!;
    const spender = dryRun.tx.approvalSpender!;
    const amountWei = dryRun.tx.approvalAmountWei!;
    const calldata = ERC20_IFACE.encodeFunctionData('approve', [spender, BigInt(amountWei)]);
    let gasUnits: string | null = null;
    let error: string | null = null;
    try {
      gasUnits = (await reader.estimateGas({ from, to, data: calldata, value: 0n })).toString();
    } catch (err) {
      error = err instanceof Error ? err.message.slice(0, 240) : 'unknown';
    }
    return { required, to, spender, amountWei, calldata, gasUnits, error };
  }
}

function summarizeRows(rows: FourMemeExecutionPlanRow[]): FourMemeExecutionPlan['totals'] {
  const tradeValueWei = rows.reduce((sum, row) => sum + BigInt(row.trade.tx.valueWei || '0'), 0n);
  const requiredNativeWei = rows.reduce((sum, row) => sum + BigInt(row.requiredNativeWei || '0'), 0n);
  const gasKnown = rows.every((row) => row.gas.totalGasCostWei !== null);
  const gasCostWei = gasKnown
    ? rows.reduce((sum, row) => sum + BigInt(row.gas.totalGasCostWei ?? '0'), 0n)
    : null;
  return {
    tradeValueWei: tradeValueWei.toString(),
    tradeValueBNB: formatEther(tradeValueWei),
    gasCostWei: gasCostWei?.toString() ?? null,
    gasCostBNB: gasCostWei === null ? null : formatEther(gasCostWei),
    requiredNativeWei: requiredNativeWei.toString(),
    requiredNativeBNB: formatEther(requiredNativeWei),
    ready: rows.filter((row) => row.status === 'ready_dry_run').length,
    insufficientBnb: rows.filter((row) => row.status === 'insufficient_bnb').length,
    simulationErrors: rows.filter((row) => row.status === 'simulation_error').length,
    gasUnknown: rows.filter((row) => row.status === 'gas_unknown').length
  };
}

function normalizedRequest(input: FourMemeExecutionPlanInput, tokenAddress: string): FourMemeExecutionPlanInput {
  return {
    tokenAddress,
    side: input.side,
    groupId: input.groupId,
    groupIds: input.groupIds ? [...input.groupIds] : undefined,
    walletIds: input.walletIds ? [...input.walletIds] : undefined,
    maxWallets: input.maxWallets,
    buyMode: input.buyMode,
    fundsBnb: input.fundsBnb,
    walletFundsBnb: input.walletFundsBnb ? { ...input.walletFundsBnb } : undefined,
    amountWei: input.amountWei,
    walletAmountWei: input.walletAmountWei ? { ...input.walletAmountWei } : undefined,
    slippageBps: input.slippageBps,
    walletSlippageBps: input.walletSlippageBps ? { ...input.walletSlippageBps } : undefined,
    order: input.order
  };
}

function walletAmount(walletId: string, perWallet: Record<string, string> | undefined, fallback: string | undefined, errorCode: string): string {
  const value = perWallet?.[walletId] || fallback;
  if (!value?.trim()) throw new Error(errorCode);
  return value;
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.floor(value), min), max);
}
