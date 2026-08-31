import {
  Contract,
  Interface,
  JsonRpcProvider,
  WebSocketProvider,
  formatEther,
  getAddress,
  parseEther,
  type Provider
} from 'ethers';
import type { BuneDb } from './db.js';
import type { EventBus } from './events.js';
import type { MarketService } from './market.js';
import type { BscNodePool } from './nodes.js';

const ZERO = '0x0000000000000000000000000000000000000000';
const HELPER_ADDRESS = '0xF251F83e40a78868FcfA3FA4599Dad6494E46034';

const HELPER_ABI = [
  'function getTokenInfo(address token) view returns (uint256 version, address tokenManager, address quote, uint256 lastPrice, uint256 tradingFeeRate, uint256 minTradingFee, uint256 launchTime, uint256 offers, uint256 maxOffers, uint256 funds, uint256 maxFunds, bool liquidityAdded)',
  'function tryBuy(address token, uint256 amount, uint256 funds) view returns (address tokenManager, address quote, uint256 estimatedAmount, uint256 estimatedCost, uint256 estimatedFee, uint256 amountMsgValue, uint256 amountApproval, uint256 amountFunds)',
  'function trySell(address token, uint256 amount) view returns (address tokenManager, address quote, uint256 funds, uint256 fee)'
];

const TM2_IFACE = new Interface([
  'function buyToken(address token, uint256 amount, uint256 maxFunds) payable',
  'function buyTokenAMAP(address token, uint256 funds, uint256 minAmount) payable',
  'function sellToken(address token, uint256 amount)',
  'function sellToken(uint256 origin, address token, uint256 amount, uint256 minFunds)'
]);

export interface FourMemeTokenInfo {
  version: number;
  tokenManager: string;
  quote: string | null;
  lastPrice: string;
  tradingFeeRate: number;
  minTradingFee: string;
  launchTime: number;
  offers: string;
  maxOffers: string;
  funds: string;
  maxFunds: string;
  liquidityAdded: boolean;
}

export interface FourMemeBuyQuote {
  tokenManager: string;
  quote: string | null;
  estimatedAmount: string;
  estimatedCost: string;
  estimatedFee: string;
  amountMsgValue: string;
  amountApproval: string;
  amountFunds: string;
}

export interface FourMemeSellQuote {
  tokenManager: string;
  quote: string | null;
  funds: string;
  fee: string;
}

export interface FourMemeChainReader {
  chainId(): Promise<bigint>;
  tokenInfo(tokenAddress: string): Promise<FourMemeTokenInfo>;
  quoteBuy(tokenAddress: string, amountWei: bigint, fundsWei: bigint): Promise<FourMemeBuyQuote>;
  quoteSell(tokenAddress: string, amountWei: bigint): Promise<FourMemeSellQuote>;
  getTransactionCount(address: string): Promise<number>;
  gasPrice(): Promise<bigint | null>;
  estimateGas(tx: { from?: string; to: string; data: string; value?: bigint }): Promise<bigint>;
  call(tx: { from?: string; to: string; data: string; value?: bigint }): Promise<string>;
  destroy(): void;
}

export interface FourMemeTradeDryRunInput {
  tokenAddress: string;
  side: 'buy' | 'sell';
  walletId?: string;
  walletAddress?: string;
  buyMode?: 'funds' | 'amount';
  fundsWei?: string;
  fundsBnb?: string;
  amountWei?: string;
  maxFundsWei?: string;
  minAmountWei?: string;
  minFundsWei?: string;
  slippageBps?: number;
}

export interface FourMemeTradeDryRun {
  readOnly: true;
  broadcast: false;
  chainId: 56;
  node: string;
  tokenAddress: string;
  side: 'buy' | 'sell';
  buyMode: 'funds' | 'amount' | null;
  walletId: string | null;
  walletAddress: string | null;
  tokenInfo: FourMemeTokenInfo;
  quote: FourMemeBuyQuote | FourMemeSellQuote;
  tx: {
    to: string;
    functionName: 'buyToken' | 'buyTokenAMAP' | 'sellToken' | 'sellTokenWithMinFunds';
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

class EthersFourMemeReader implements FourMemeChainReader {
  private readonly helper: Contract;

  constructor(private readonly provider: Provider) {
    this.helper = new Contract(HELPER_ADDRESS, HELPER_ABI, provider);
  }

  async chainId(): Promise<bigint> {
    return (await this.provider.getNetwork()).chainId;
  }

  async tokenInfo(tokenAddress: string): Promise<FourMemeTokenInfo> {
    return tokenInfoFromTuple(await this.helper.getTokenInfo(tokenAddress) as unknown[]);
  }

  async quoteBuy(tokenAddress: string, amountWei: bigint, fundsWei: bigint): Promise<FourMemeBuyQuote> {
    return buyQuoteFromTuple(await this.helper.tryBuy(tokenAddress, amountWei, fundsWei) as unknown[]);
  }

  async quoteSell(tokenAddress: string, amountWei: bigint): Promise<FourMemeSellQuote> {
    return sellQuoteFromTuple(await this.helper.trySell(tokenAddress, amountWei) as unknown[]);
  }

  async getTransactionCount(address: string): Promise<number> {
    return this.provider.getTransactionCount(address, 'pending');
  }

  async gasPrice(): Promise<bigint | null> {
    return (await this.provider.getFeeData()).gasPrice ?? null;
  }

  async estimateGas(tx: { from?: string; to: string; data: string; value?: bigint }): Promise<bigint> {
    return this.provider.estimateGas(tx);
  }

  async call(tx: { from?: string; to: string; data: string; value?: bigint }): Promise<string> {
    return this.provider.call(tx);
  }

  destroy(): void {
    const maybeDestroy = this.provider as Provider & { destroy?: () => void };
    try {
      maybeDestroy.destroy?.();
    } catch {
      // Some WS providers can throw if destroyed before the socket is open.
    }
  }
}

export class FourMemeTradeService {
  constructor(
    private readonly db: BuneDb,
    private readonly nodes: BscNodePool,
    private readonly market: MarketService,
    private readonly events: EventBus,
    private readonly providerFactory = defaultReaderForUrl
  ) {}

  async tradeDryRun(input: FourMemeTradeDryRunInput): Promise<FourMemeTradeDryRun> {
    const httpUrls = await this.nodes.bestHttpUrls(2).catch(() => []);
    const wsUrls = await this.nodes.bestWsUrls(3).catch(() => []);
    const urls = [...httpUrls, ...wsUrls];
    if (!urls.length) throw new Error('no_healthy_bsc_rpc_node');
    let lastError: unknown = null;
    for (const url of urls) {
      const reader = this.providerFactory(url);
      try {
        return await this.tradeDryRunWithReader(reader, url, input);
      } catch (error) {
        lastError = error;
      } finally {
        reader.destroy();
      }
    }
    throw lastError instanceof Error ? lastError : new Error('all_bsc_nodes_failed');
  }

  async tradeDryRunWithReader(
    reader: FourMemeChainReader,
    node: string,
    input: FourMemeTradeDryRunInput
  ): Promise<FourMemeTradeDryRun> {
    const chainId = await reader.chainId();
    if (chainId !== 56n) throw new Error(`wrong_chain_${chainId.toString()}`);
    const tokenAddress = getAddress(input.tokenAddress);
    const wallet = input.walletId ? this.db.walletById(input.walletId) : null;
    if (input.walletId && !wallet) throw new Error('wallet_not_found');
    const walletAddress = input.walletAddress ? getAddress(input.walletAddress) : wallet?.address ?? null;
    const slippageBps = clampInt(input.slippageBps ?? 500, 0, 5000);
    const tokenInfo = await reader.tokenInfo(tokenAddress);
    const warnings: string[] = [
      tokenInfo.version !== 2 ? `token_manager_version_${tokenInfo.version}_not_v2` : '',
      tokenInfo.liquidityAdded ? 'liquidity_added_post_migration_use_dex_quote_before_real_trade' : '',
      !walletAddress ? 'wallet_missing_skipping_from_based_simulation' : ''
    ].filter(Boolean);

    const quote = input.side === 'buy'
      ? await reader.quoteBuy(tokenAddress, buyAmountWei(input), buyFundsWei(input))
      : await reader.quoteSell(tokenAddress, requiredBigInt(input.amountWei, 'amount_wei_required_for_sell'));
    const plan = buildTxPlan(tokenAddress, input, tokenInfo, quote, slippageBps);
    const simulationErrors: string[] = [];
    let estimateGas: string | null = null;
    let callSuccess: boolean | null = null;
    let callResult: string | null = null;
    if (walletAddress) {
      const tx = { from: walletAddress, to: plan.to, data: plan.calldata, value: plan.valueWei };
      try {
        estimateGas = (await reader.estimateGas(tx)).toString();
      } catch (error) {
        simulationErrors.push(`estimate_gas_failed:${errorMessage(error)}`);
      }
      try {
        callResult = await reader.call(tx);
        callSuccess = true;
      } catch (error) {
        callSuccess = false;
        simulationErrors.push(`eth_call_failed:${errorMessage(error)}`);
      }
    }

    const [tokenPrice, bnbPrice] = await Promise.all([
      this.market.tokenPrice(tokenAddress).catch(() => null),
      this.market.bnbPrice().catch(() => null)
    ]);
    const estimatedBnb = input.side === 'buy'
      ? Number(formatEther((quote as FourMemeBuyQuote).amountMsgValue || '0'))
      : (quote as FourMemeSellQuote).quote === null && bnbPrice
        ? Number(formatEther((quote as FourMemeSellQuote).funds || '0'))
        : 0;
    const dryRun: FourMemeTradeDryRun = {
      readOnly: true,
      broadcast: false,
      chainId: 56,
      node,
      tokenAddress,
      side: input.side,
      buyMode: input.side === 'buy' ? input.buyMode ?? 'funds' : null,
      walletId: wallet?.id ?? null,
      walletAddress,
      tokenInfo,
      quote,
      tx: {
        to: plan.to,
        functionName: plan.functionName,
        calldata: plan.calldata,
        valueWei: plan.valueWei.toString(),
        valueBNB: formatEther(plan.valueWei),
        approvalToken: plan.approvalToken,
        approvalSpender: plan.approvalSpender,
        approvalAmountWei: plan.approvalAmountWei
      },
      simulation: {
        estimateGas,
        callSuccess,
        callResult,
        errors: simulationErrors
      },
      market: {
        tokenPriceUsd: tokenPrice?.priceUsd ?? null,
        tokenPriceSource: tokenPrice?.source ?? null,
        lifecyclePhase: tokenPrice?.lifecyclePhase ?? null,
        bnbPriceUsd: bnbPrice?.priceUsd ?? null,
        estimatedValueUsd: bnbPrice ? estimatedBnb * bnbPrice.priceUsd : null
      },
      warnings
    };
    this.events.emitEvent({
      type: 'four_meme.trade_dry_run',
      severity: simulationErrors.length ? 'warn' : 'info',
      message: `Four.meme ${input.side} dry-run ${tokenAddress}`,
      metadata: {
        tokenAddress,
        side: input.side,
        walletId: wallet?.id ?? null,
        tokenManager: tokenInfo.tokenManager,
        functionName: dryRun.tx.functionName,
        estimateGas,
        simulationErrors,
        broadcast: false
      }
    });
    return dryRun;
  }
}

export function defaultReaderForUrl(url: string): FourMemeChainReader {
  const provider = url.startsWith('ws')
    ? new WebSocketProvider(url, 56)
    : new JsonRpcProvider(url, 56);
  const maybeWs = provider as Provider & {
    websocket?: { on?: (event: 'error', listener: (error: unknown) => void) => void };
    _websocket?: { on?: (event: 'error', listener: (error: unknown) => void) => void };
  };
  maybeWs.websocket?.on?.('error', () => undefined);
  maybeWs._websocket?.on?.('error', () => undefined);
  return new EthersFourMemeReader(provider);
}

function buildTxPlan(
  tokenAddress: string,
  input: FourMemeTradeDryRunInput,
  tokenInfo: FourMemeTokenInfo,
  quote: FourMemeBuyQuote | FourMemeSellQuote,
  slippageBps: number
): {
  to: string;
  functionName: FourMemeTradeDryRun['tx']['functionName'];
  calldata: string;
  valueWei: bigint;
  approvalToken: string | null;
  approvalSpender: string | null;
  approvalAmountWei: string | null;
} {
  if (input.side === 'buy') {
    const buyQuote = quote as FourMemeBuyQuote;
    const buyMode = input.buyMode ?? 'funds';
    if (buyMode === 'amount') {
      const amountWei = requiredBigInt(input.amountWei, 'amount_wei_required_for_buy_amount');
      const maxFunds = input.maxFundsWei
        ? BigInt(input.maxFundsWei)
        : addSlippage(BigInt(buyQuote.estimatedCost) + BigInt(buyQuote.estimatedFee), slippageBps);
      return {
        to: tokenInfo.tokenManager,
        functionName: 'buyToken',
        calldata: TM2_IFACE.encodeFunctionData('buyToken', [tokenAddress, amountWei, maxFunds]),
        valueWei: BigInt(buyQuote.amountMsgValue),
        approvalToken: buyQuote.quote,
        approvalSpender: buyQuote.quote ? tokenInfo.tokenManager : null,
        approvalAmountWei: buyQuote.quote ? buyQuote.amountApproval : null
      };
    }
    const fundsWei = buyFundsWei(input);
    const minAmount = input.minAmountWei
      ? BigInt(input.minAmountWei)
      : subtractSlippage(BigInt(buyQuote.estimatedAmount), slippageBps);
    return {
      to: tokenInfo.tokenManager,
      functionName: 'buyTokenAMAP',
      calldata: TM2_IFACE.encodeFunctionData('buyTokenAMAP', [tokenAddress, fundsWei, minAmount]),
      valueWei: BigInt(buyQuote.amountMsgValue),
      approvalToken: buyQuote.quote,
      approvalSpender: buyQuote.quote ? tokenInfo.tokenManager : null,
      approvalAmountWei: buyQuote.quote ? buyQuote.amountApproval : null
    };
  }
  const sellQuote = quote as FourMemeSellQuote;
  const amountWei = requiredBigInt(input.amountWei, 'amount_wei_required_for_sell');
  const minFunds = input.minFundsWei ? BigInt(input.minFundsWei) : subtractSlippage(BigInt(sellQuote.funds), slippageBps);
  return {
    to: tokenInfo.tokenManager,
    functionName: 'sellTokenWithMinFunds',
    calldata: TM2_IFACE.encodeFunctionData('sellToken(uint256,address,uint256,uint256)', [0n, tokenAddress, amountWei, minFunds]),
    valueWei: 0n,
    approvalToken: tokenAddress,
    approvalSpender: tokenInfo.tokenManager,
    approvalAmountWei: amountWei.toString()
  };
}

function tokenInfoFromTuple(row: unknown[]): FourMemeTokenInfo {
  return {
    version: Number(row[0]),
    tokenManager: getAddress(String(row[1])),
    quote: normalizeQuote(row[2]),
    lastPrice: String(row[3] ?? '0'),
    tradingFeeRate: Number(row[4] ?? 0) / 10000,
    minTradingFee: String(row[5] ?? '0'),
    launchTime: Number(row[6] ?? 0),
    offers: String(row[7] ?? '0'),
    maxOffers: String(row[8] ?? '0'),
    funds: String(row[9] ?? '0'),
    maxFunds: String(row[10] ?? '0'),
    liquidityAdded: Boolean(row[11])
  };
}

function buyQuoteFromTuple(row: unknown[]): FourMemeBuyQuote {
  return {
    tokenManager: getAddress(String(row[0])),
    quote: normalizeQuote(row[1]),
    estimatedAmount: String(row[2] ?? '0'),
    estimatedCost: String(row[3] ?? '0'),
    estimatedFee: String(row[4] ?? '0'),
    amountMsgValue: String(row[5] ?? '0'),
    amountApproval: String(row[6] ?? '0'),
    amountFunds: String(row[7] ?? '0')
  };
}

function sellQuoteFromTuple(row: unknown[]): FourMemeSellQuote {
  return {
    tokenManager: getAddress(String(row[0])),
    quote: normalizeQuote(row[1]),
    funds: String(row[2] ?? '0'),
    fee: String(row[3] ?? '0')
  };
}

function normalizeQuote(value: unknown): string | null {
  const address = getAddress(String(value ?? ZERO));
  return address.toLowerCase() === ZERO.toLowerCase() ? null : address;
}

function buyAmountWei(input: FourMemeTradeDryRunInput): bigint {
  return input.side === 'buy' && input.buyMode === 'amount'
    ? requiredBigInt(input.amountWei, 'amount_wei_required_for_buy_amount')
    : 0n;
}

function buyFundsWei(input: FourMemeTradeDryRunInput): bigint {
  if (input.side !== 'buy') return 0n;
  if (input.buyMode === 'amount') return 0n;
  if (input.fundsWei) return BigInt(input.fundsWei);
  if (input.fundsBnb) return parseEther(input.fundsBnb);
  throw new Error('funds_required_for_buy_funds');
}

function requiredBigInt(value: string | undefined, errorCode: string): bigint {
  if (!value) throw new Error(errorCode);
  const parsed = BigInt(value);
  if (parsed <= 0n) throw new Error(errorCode);
  return parsed;
}

function addSlippage(value: bigint, slippageBps: number): bigint {
  return value * BigInt(10_000 + slippageBps) / 10_000n;
}

function subtractSlippage(value: bigint, slippageBps: number): bigint {
  return value * BigInt(Math.max(10_000 - slippageBps, 0)) / 10_000n;
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.floor(value), min), max);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 240) : 'unknown';
}
