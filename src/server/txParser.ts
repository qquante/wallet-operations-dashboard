import { Contract, Interface, JsonRpcProvider, WebSocketProvider, formatEther, formatUnits, getAddress } from 'ethers';
import type { BuneDb } from './db.js';
import { EtherscanV2Client, type EtherscanInternalTx, type EtherscanTokenTransfer, type EtherscanTxData } from './etherscan.js';
import type { MarketService } from './market.js';
import type { BscNodePool } from './nodes.js';

const TRANSFER_IFACE = new Interface([
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)'
]);

const ERC20_ABI = [
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)'
];

const WBNB = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
const USDT = '0x55d398326f99059fF775485246999027B3197955';
const USD1 = '0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d';
const UUSD = '0x61a10e8556bEd032ea176330E7F17D6A12A10000';
const STABLE_TOKENS = new Set([USDT, USD1, UUSD].map((address) => address.toLowerCase()));

interface ReceiptLike {
  blockNumber: number;
  status: number | null;
  gasUsed?: bigint;
  gasPrice?: bigint;
  fee?: bigint;
  logs: readonly {
    address: string;
    data: string;
    topics: readonly string[];
    index?: number;
    logIndex?: number;
  }[];
}

interface TransactionLike {
  hash: string;
  from: string;
  to: string | null;
  value: bigint;
  gasPrice?: bigint | null;
}

interface ProviderLike {
  getNetwork(): Promise<{ chainId: bigint }>;
  getTransaction(hash: string): Promise<TransactionLike | null>;
  getTransactionReceipt(hash: string): Promise<ReceiptLike | null>;
  getBlock(blockNumber: number): Promise<{ timestamp?: number } | null>;
}

export interface TxPreviewInput {
  txHash: string;
  fillId?: string;
  walletId?: string;
  walletAddress?: string;
  tokenAddress?: string;
  side?: 'buy' | 'sell';
}

export interface TxTokenTransfer {
  logIndex: number;
  tokenAddress: string;
  tokenSymbol: string;
  tokenDecimals: number;
  from: string;
  to: string;
  valueRaw: string;
  amount: string;
  direction: 'in' | 'out' | 'unrelated';
  source: 'rpc_log' | 'etherscan_v2';
}

export interface TxPreview {
  readOnly: true;
  chainId: 56;
  txHash: string;
  node: string;
  blockNumber: number;
  blockTimestamp: number | null;
  status: 'success' | 'failed' | 'unknown';
  from: string;
  to: string | null;
  walletId: string | null;
  walletAddress: string | null;
  tokenAddress: string | null;
  nativeValueWei: string;
  nativeValueBNB: string;
  gasUsedWei: string | null;
  gasCostBNB: string | null;
  bnbPrice: {
    priceUsd: number;
    source: string;
    historical: boolean;
    timestamp: number | null;
    openTimeMs: number | null;
    closeTimeMs: number | null;
  } | null;
  transfers: TxTokenTransfer[];
  explorer: {
    enabled: boolean;
    source: 'etherscan_v2';
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
    txHash: string;
    confidence: 'high' | 'medium' | 'low';
    reason: string;
  };
  warnings: string[];
}

export class TxParserService {
  constructor(
    private readonly db: BuneDb,
    private readonly nodes: BscNodePool,
    private readonly market: MarketService,
    private readonly resolveMeta: (provider: ProviderLike, tokenAddress: string) => Promise<{ symbol: string; decimals: number }> = tokenMeta,
    private readonly explorer = new EtherscanV2Client()
  ) {}

  async preview(input: TxPreviewInput): Promise<TxPreview> {
    const httpUrls = await this.nodes.bestHttpUrls(3).catch(() => []);
    const wsUrls = await this.nodes.bestWsUrls(3).catch(() => []);
    const urls = [...httpUrls, ...wsUrls];
    if (!urls.length) throw new Error('no_healthy_bsc_rpc_node');
    let lastError: unknown = null;
    for (const url of urls) {
      const provider = url.startsWith('ws')
        ? new WebSocketProvider(url, 56)
        : new JsonRpcProvider(url, 56);
      try {
        return await this.previewWithProvider(provider, url, input);
      } catch (error) {
        lastError = error;
      } finally {
        provider.destroy();
      }
    }
    throw lastError instanceof Error ? lastError : new Error('all_bsc_http_nodes_failed');
  }

  async previewWithProvider(provider: ProviderLike, node: string, input: TxPreviewInput): Promise<TxPreview> {
    const network = await provider.getNetwork();
    if (network.chainId !== 56n) throw new Error(`wrong_chain_${network.chainId.toString()}`);
    const fill = input.fillId ? this.db.positionFillById(input.fillId) : null;
    if (input.fillId && !fill) throw new Error('position_fill_not_found');
    const wallet = input.walletId
      ? this.db.walletById(input.walletId)
      : fill?.walletId
        ? this.db.walletById(fill.walletId)
        : null;
    if (input.walletId && !wallet) throw new Error('wallet_not_found');
    const walletAddress = normalizeAddress(input.walletAddress || wallet?.address || fill?.walletAddress || null);
    const tokenAddress = normalizeAddress(input.tokenAddress || fill?.tokenAddress || null);
    const expectedSide = input.side ?? fill?.side ?? null;
    const txHash = input.txHash.trim();
    const tx = await provider.getTransaction(txHash);
    if (!tx) throw new Error('tx_not_found');
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) throw new Error('tx_receipt_not_found');
    const block = await provider.getBlock(receipt.blockNumber).catch(() => null);
    const rpcTransfers = await decodeTransfers(provider, receipt, walletAddress, this.resolveMeta);
    const explorer = await this.explorer.txData({
      txHash,
      walletAddress,
      tokenAddress,
      blockNumber: receipt.blockNumber
    }).catch((error): EtherscanTxData => ({
      enabled: this.explorer.isEnabled(),
      source: 'etherscan_v2',
      internalTxs: [],
      tokenTransfers: [],
      warnings: [`etherscan_preview_failed:${error instanceof Error ? error.message : 'unknown'}`]
    }));
    const transfers = mergeTransfers(rpcTransfers, transfersFromExplorer(explorer.tokenTransfers, walletAddress));
    const bnbPrice = await resolveBnbPrice(this.market, block?.timestamp ?? null);
    const nativeValueBNB = formatEther(tx.value ?? 0n);
    const gasPrice = receipt.gasPrice ?? tx.gasPrice ?? null;
    const gasCostWei = gasPrice && receipt.gasUsed ? gasPrice * receipt.gasUsed : receipt.fee ?? null;
    const suggestion = buildSuggestion({
      transfers,
      tx,
      walletAddress,
      tokenAddress,
      expectedSide,
      bnbPriceUsd: bnbPrice.price?.priceUsd ?? null,
      internalTxs: explorer.internalTxs
    });
    const warnings = [
      suggestion.valueUsd !== null && suggestion.bnbAmount && !bnbPrice.price?.historical ? 'value_usd_uses_current_bnb_price_not_historical' : '',
      suggestion.side === 'sell' && suggestion.valueUsd === null ? 'sell_native_value_not_found_in_receipt_or_explorer' : '',
      receipt.status === 0 ? 'tx_failed_receipt_status_0' : '',
      !walletAddress ? 'wallet_hint_missing_direction_is_unrelated' : '',
      !tokenAddress ? 'token_hint_missing_using_best_wallet_transfer_candidate' : '',
      ...bnbPrice.warnings,
      ...explorer.warnings
    ].filter(Boolean);

    return {
      readOnly: true,
      chainId: 56,
      txHash: tx.hash,
      node,
      blockNumber: receipt.blockNumber,
      blockTimestamp: block?.timestamp ?? null,
      status: receipt.status === 1 ? 'success' : receipt.status === 0 ? 'failed' : 'unknown',
      from: getAddress(tx.from),
      to: tx.to ? getAddress(tx.to) : null,
      walletId: wallet?.id ?? fill?.walletId ?? null,
      walletAddress,
      tokenAddress,
      nativeValueWei: (tx.value ?? 0n).toString(),
      nativeValueBNB,
      gasUsedWei: gasCostWei?.toString() ?? null,
      gasCostBNB: gasCostWei ? formatEther(gasCostWei) : null,
      bnbPrice: bnbPrice.price,
      transfers,
      explorer: {
        enabled: explorer.enabled,
        source: explorer.source,
        internalTxs: explorer.internalTxs.length,
        tokenTransfers: explorer.tokenTransfers.length,
        warnings: explorer.warnings
      },
      suggestion,
      warnings
    };
  }
}

export async function decodeTransfers(
  provider: ProviderLike,
  receipt: ReceiptLike,
  walletAddress: string | null,
  resolveMeta: (provider: ProviderLike, tokenAddress: string) => Promise<{ symbol: string; decimals: number }> = tokenMeta
): Promise<TxTokenTransfer[]> {
  const meta = new Map<string, { symbol: string; decimals: number }>();
  const transfers: Array<{ logIndex: number; tokenAddress: string; from: string; to: string; value: bigint }> = [];
  for (const log of receipt.logs) {
    const parsed = (() => {
      try {
        return TRANSFER_IFACE.parseLog({ topics: log.topics, data: log.data });
      } catch {
        return null;
      }
    })();
    if (!parsed || parsed.name !== 'Transfer') continue;
    transfers.push({
      logIndex: Number(log.index ?? log.logIndex ?? transfers.length),
      tokenAddress: getAddress(log.address),
      from: getAddress(String(parsed.args[0])),
      to: getAddress(String(parsed.args[1])),
      value: parsed.args[2] as bigint
    });
  }
  for (const transfer of transfers) {
    if (!meta.has(transfer.tokenAddress)) {
      meta.set(transfer.tokenAddress, await resolveMeta(provider, transfer.tokenAddress));
    }
  }
  return transfers.map((transfer) => {
    const token = meta.get(transfer.tokenAddress) ?? { symbol: 'TOKEN', decimals: 18 };
    return {
      logIndex: transfer.logIndex,
      tokenAddress: transfer.tokenAddress,
      tokenSymbol: token.symbol,
      tokenDecimals: token.decimals,
      from: transfer.from,
      to: transfer.to,
      valueRaw: transfer.value.toString(),
      amount: formatUnits(transfer.value, token.decimals),
      direction: walletAddress && transfer.to.toLowerCase() === walletAddress.toLowerCase()
        ? 'in'
        : walletAddress && transfer.from.toLowerCase() === walletAddress.toLowerCase()
          ? 'out'
          : 'unrelated',
      source: 'rpc_log'
    };
  });
}

async function tokenMeta(provider: ProviderLike, tokenAddress: string): Promise<{ symbol: string; decimals: number }> {
  const token = new Contract(tokenAddress, ERC20_ABI, provider as JsonRpcProvider);
  const [symbol, decimals] = await Promise.all([
    token.symbol().catch(() => 'TOKEN'),
    token.decimals().catch(() => 18)
  ]);
  return {
    symbol: String(symbol || 'TOKEN'),
    decimals: Number(decimals || 18)
  };
}

async function resolveBnbPrice(
  market: MarketService,
  blockTimestamp: number | null
): Promise<{
  price: TxPreview['bnbPrice'];
  warnings: string[];
}> {
  const warnings: string[] = [];
  const maybeHistorical = market as MarketService & {
    bnbPriceAt?: (timestamp: number) => Promise<{
      priceUsd: number;
      source: string;
      timestamp: number;
      openTimeMs: number;
      closeTimeMs: number;
    }>;
  };
  if (blockTimestamp && typeof maybeHistorical.bnbPriceAt === 'function') {
    try {
      const historical = await maybeHistorical.bnbPriceAt(blockTimestamp);
      return {
        price: {
          priceUsd: historical.priceUsd,
          source: historical.source,
          historical: true,
          timestamp: historical.timestamp,
          openTimeMs: historical.openTimeMs,
          closeTimeMs: historical.closeTimeMs
        },
        warnings
      };
    } catch (error) {
      warnings.push(`bnb_historical_price_failed:${error instanceof Error ? error.message : 'unknown'}`);
    }
  }
  const current = await market.bnbPrice().catch(() => null);
  if (!current) return { price: null, warnings: [...warnings, 'bnb_price_unavailable'] };
  return {
    price: {
      priceUsd: current.priceUsd,
      source: current.source,
      historical: false,
      timestamp: blockTimestamp,
      openTimeMs: null,
      closeTimeMs: null
    },
    warnings
  };
}

function buildSuggestion(input: {
  transfers: TxTokenTransfer[];
  tx: TransactionLike;
  walletAddress: string | null;
  tokenAddress: string | null;
  expectedSide: 'buy' | 'sell' | null;
  bnbPriceUsd: number | null;
  internalTxs: EtherscanInternalTx[];
}): TxPreview['suggestion'] {
  const wallet = input.walletAddress?.toLowerCase() ?? null;
  const target = input.tokenAddress?.toLowerCase() ?? null;
  const candidates = input.transfers.filter((transfer) => {
    if (target && transfer.tokenAddress.toLowerCase() !== target) return false;
    if (!wallet) return true;
    if (input.expectedSide === 'buy') return transfer.direction === 'in';
    if (input.expectedSide === 'sell') return transfer.direction === 'out';
    return transfer.direction === 'in' || transfer.direction === 'out';
  });
  const selected = candidates[0] ?? input.transfers.find((transfer) => transfer.direction === 'in' || transfer.direction === 'out') ?? null;
  const inferredSide = input.expectedSide ?? (selected?.direction === 'in' ? 'buy' : selected?.direction === 'out' ? 'sell' : null);
  const nativeBnbAmount = input.tx.value && input.tx.value > 0n ? formatEther(input.tx.value) : null;
  const outputValue = inferredSide === 'sell' && wallet
    ? outputValueForWallet(input.transfers, input.internalTxs, wallet, input.bnbPriceUsd)
    : { valueUsd: null as number | null, bnbAmount: null as string | null };
  const bnbAmount = inferredSide === 'buy' ? nativeBnbAmount : outputValue.bnbAmount;
  const valueUsd = inferredSide === 'buy' && nativeBnbAmount && input.bnbPriceUsd
    ? Number(nativeBnbAmount) * input.bnbPriceUsd
    : outputValue.valueUsd;

  return {
    side: inferredSide,
    tokenAddress: selected?.tokenAddress ?? input.tokenAddress,
    tokenSymbol: selected?.tokenSymbol ?? null,
    tokenDecimals: selected?.tokenDecimals ?? null,
    quantityRaw: selected?.valueRaw ?? null,
    quantityTokens: selected?.amount ?? null,
    bnbAmount,
    valueUsd,
    priceUsd: selected && valueUsd !== null && Number(selected.amount) > 0 ? valueUsd / Number(selected.amount) : null,
    txHash: input.tx.hash,
    confidence: selected && target && wallet ? 'high' : selected && wallet ? 'medium' : 'low',
    reason: selected
      ? `matched_${selected.direction}_erc20_transfer${target ? '_target_token' : ''}`
      : 'no_matching_erc20_transfer'
  };
}

function outputValueForWallet(
  transfers: TxTokenTransfer[],
  internalTxs: EtherscanInternalTx[],
  wallet: string,
  bnbPriceUsd: number | null
): { valueUsd: number | null; bnbAmount: string | null } {
  const incoming = transfers.filter((transfer) => transfer.to.toLowerCase() === wallet);
  const wbnb = incoming.find((transfer) => transfer.tokenAddress.toLowerCase() === WBNB.toLowerCase());
  if (wbnb && bnbPriceUsd) {
    return { valueUsd: Number(wbnb.amount) * bnbPriceUsd, bnbAmount: wbnb.amount };
  }
  const stable = incoming.find((transfer) => STABLE_TOKENS.has(transfer.tokenAddress.toLowerCase()));
  if (stable) return { valueUsd: Number(stable.amount), bnbAmount: null };
  const internalWei = internalTxs
    .filter((tx) => tx.to?.toLowerCase() === wallet && tx.isError !== '1')
    .reduce((sum, tx) => {
      try {
        return sum + BigInt(tx.value || '0');
      } catch {
        return sum;
      }
    }, 0n);
  if (internalWei > 0n && bnbPriceUsd) {
    const bnbAmount = formatEther(internalWei);
    return { valueUsd: Number(bnbAmount) * bnbPriceUsd, bnbAmount };
  }
  return { valueUsd: null, bnbAmount: null };
}

function transfersFromExplorer(rows: EtherscanTokenTransfer[], walletAddress: string | null): TxTokenTransfer[] {
  return rows.flatMap((row, index) => {
    try {
      const decimals = Number(row.tokenDecimal ?? 18);
      const from = getAddress(row.from);
      const to = getAddress(row.to);
      return [{
        logIndex: Number(row.transactionIndex ?? index),
        tokenAddress: getAddress(row.contractAddress),
        tokenSymbol: String(row.tokenSymbol || 'TOKEN'),
        tokenDecimals: Number.isFinite(decimals) ? decimals : 18,
        from,
        to,
        valueRaw: String(row.value ?? '0'),
        amount: formatUnits(BigInt(row.value || '0'), Number.isFinite(decimals) ? decimals : 18),
        direction: walletAddress && to.toLowerCase() === walletAddress.toLowerCase()
          ? 'in' as const
          : walletAddress && from.toLowerCase() === walletAddress.toLowerCase()
            ? 'out' as const
            : 'unrelated' as const,
        source: 'etherscan_v2' as const
      }];
    } catch {
      return [];
    }
  });
}

function mergeTransfers(primary: TxTokenTransfer[], secondary: TxTokenTransfer[]): TxTokenTransfer[] {
  const seen = new Set<string>();
  const merged: TxTokenTransfer[] = [];
  for (const transfer of [...primary, ...secondary]) {
    const key = [
      transfer.tokenAddress.toLowerCase(),
      transfer.from.toLowerCase(),
      transfer.to.toLowerCase(),
      transfer.valueRaw
    ].join(':');
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(transfer);
  }
  return merged.sort((a, b) => a.logIndex - b.logIndex);
}

function normalizeAddress(address: string | null | undefined): string | null {
  const value = String(address ?? '').trim();
  return value ? getAddress(value) : null;
}
