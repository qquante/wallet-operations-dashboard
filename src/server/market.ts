import type { EventBus } from './events.js';
import { nowIso } from './time.js';
import { getAddress } from 'ethers';
import type { BuneDb } from './db.js';

export interface BnbPrice {
  symbol: 'BNBUSDT';
  priceUsd: number;
  source: 'binance_spot';
  updatedAt: string;
  cacheMs: number;
}

export interface BnbHistoricalPrice {
  symbol: 'BNBUSDT';
  priceUsd: number;
  source: 'binance_spot_kline';
  interval: '1m';
  timestamp: number;
  openTimeMs: number;
  closeTimeMs: number;
  openUsd: number;
  highUsd: number;
  lowUsd: number;
  closeUsd: number;
  volume: string | null;
  updatedAt: string;
}

export interface TokenPrice {
  tokenAddress: string;
  priceUsd: number | null;
  source: 'four_meme' | 'dexscreener' | 'coingecko_onchain';
  lifecyclePhase: 'four_meme_bonding' | 'dex_trading' | 'unknown';
  updatedAt: string;
  cacheMs: number;
  available: boolean;
  marketCapUsd: number | null;
  progress: number | null;
  fourMemeStatus: string | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  quoteSymbol: string | null;
  lifecycleSource: 'four_meme' | 'public_onchain' | 'unavailable';
  metadata: Record<string, unknown>;
}

interface FourMemePriceContext {
  priceUsd: number | null;
  marketCapUsd: number | null;
  progress: number | null;
  status: string | null;
  quoteSymbol: string | null;
  volume24hUsd: number | null;
  liquidityUsd: number | null;
  holderCount: number | null;
  raw: Record<string, unknown>;
}

interface PublicPriceCandidate {
  priceUsd: number;
  source: TokenPrice['source'];
  liquidityUsd: number | null;
  metadata: Record<string, unknown>;
}

const FOUR_MEME_BASE = 'https://four.meme/meme-api/v1';

function ensureObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function parseFiniteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export class MarketService {
  private cached: BnbPrice | null = null;
  private tokenCache = new Map<string, TokenPrice>();
  private bnbHistoricalCache = new Map<number, BnbHistoricalPrice>();
  private readonly cacheMs = 30_000;

  constructor(private readonly events: EventBus, private readonly db?: BuneDb) {}

  async bnbPrice(): Promise<BnbPrice> {
    const now = Date.now();
    if (this.cached && now - Date.parse(this.cached.updatedAt) < this.cacheMs) {
      return this.cached;
    }

    try {
      const response = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BNBUSDT', {
        signal: AbortSignal.timeout(5000)
      });
      if (!response.ok) throw new Error(`binance_http_${response.status}`);
      const data = await response.json() as { symbol?: string; price?: string };
      const priceUsd = Number(data.price);
      if (data.symbol !== 'BNBUSDT' || !Number.isFinite(priceUsd) || priceUsd <= 0) {
        throw new Error('binance_invalid_bnb_price');
      }
      this.cached = {
        symbol: 'BNBUSDT',
        priceUsd,
        source: 'binance_spot',
        updatedAt: nowIso(),
        cacheMs: this.cacheMs
      };
      this.events.emitEvent({
        type: 'market.bnb_price',
        severity: 'info',
        message: `BNB price sync $${priceUsd.toFixed(2)}`,
        metadata: { symbol: 'BNBUSDT', priceUsd, source: 'binance_spot' }
      });
      return this.cached;
    } catch (error) {
      if (this.cached) return this.cached;
      throw error;
    }
  }

  async bnbPriceAt(timestamp: number): Promise<BnbHistoricalPrice> {
    if (!Number.isFinite(timestamp) || timestamp <= 0) throw new Error('bnb_price_timestamp_invalid');
    const timestampMs = timestamp < 10_000_000_000 ? Math.floor(timestamp * 1000) : Math.floor(timestamp);
    const openTimeMs = minuteOpenMs(timestampMs);
    const cached = this.bnbHistoricalCache.get(openTimeMs);
    if (cached) return cached;

    const stored = this.db?.bnbPriceSnapshotAt(timestampMs, '1m');
    if (stored && stored.source === 'binance_spot_kline') {
      const result = {
        symbol: 'BNBUSDT' as const,
        priceUsd: stored.priceUsd,
        source: 'binance_spot_kline' as const,
        interval: '1m' as const,
        timestamp: Math.floor(timestampMs / 1000),
        openTimeMs: stored.openTimeMs,
        closeTimeMs: stored.closeTimeMs,
        openUsd: stored.openUsd,
        highUsd: stored.highUsd,
        lowUsd: stored.lowUsd,
        closeUsd: stored.closeUsd,
        volume: stored.volume,
        updatedAt: stored.createdAt
      };
      this.bnbHistoricalCache.set(openTimeMs, result);
      return result;
    }

    const url = new URL('https://api.binance.com/api/v3/klines');
    url.searchParams.set('symbol', 'BNBUSDT');
    url.searchParams.set('interval', '1m');
    url.searchParams.set('startTime', String(openTimeMs));
    url.searchParams.set('endTime', String(openTimeMs + 59_999));
    url.searchParams.set('limit', '1');
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`binance_kline_http_${response.status}`);
    const payload = await response.json() as unknown;
    if (!Array.isArray(payload) || !Array.isArray(payload[0])) throw new Error('binance_kline_invalid_payload');
    const candle = payload[0] as unknown[];
    const parsedOpenTimeMs = Number(candle[0]);
    const openUsd = parseRequiredPrice(candle[1], 'binance_kline_open_invalid');
    const highUsd = parseRequiredPrice(candle[2], 'binance_kline_high_invalid');
    const lowUsd = parseRequiredPrice(candle[3], 'binance_kline_low_invalid');
    const closeUsd = parseRequiredPrice(candle[4], 'binance_kline_close_invalid');
    const closeTimeMs = Number(candle[6]);
    if (!Number.isFinite(parsedOpenTimeMs) || !Number.isFinite(closeTimeMs)) throw new Error('binance_kline_time_invalid');
    const snapshot = this.db?.upsertBnbPriceSnapshot({
      priceUsd: closeUsd,
      source: 'binance_spot_kline',
      interval: '1m',
      openTimeMs: parsedOpenTimeMs,
      closeTimeMs,
      openUsd,
      highUsd,
      lowUsd,
      closeUsd,
      volume: candle[5] === undefined ? null : String(candle[5]),
      metadata: {
        closeTimeMs,
        quoteAssetVolume: candle[7] === undefined ? null : String(candle[7]),
        tradeCount: candle[8] === undefined ? null : Number(candle[8])
      }
    });
    const result = {
      symbol: 'BNBUSDT' as const,
      priceUsd: closeUsd,
      source: 'binance_spot_kline' as const,
      interval: '1m' as const,
      timestamp: Math.floor(timestampMs / 1000),
      openTimeMs: parsedOpenTimeMs,
      closeTimeMs,
      openUsd,
      highUsd,
      lowUsd,
      closeUsd,
      volume: candle[5] === undefined ? null : String(candle[5]),
      updatedAt: snapshot?.createdAt ?? nowIso()
    };
    this.bnbHistoricalCache.set(openTimeMs, result);
    this.events.emitEvent({
      type: 'market.bnb_price_historical',
      severity: 'info',
      message: `BNB historical ${new Date(openTimeMs).toISOString()} $${closeUsd.toFixed(2)}`,
      metadata: { symbol: 'BNBUSDT', priceUsd: closeUsd, source: 'binance_spot_kline', openTimeMs, closeTimeMs }
    });
    return result;
  }

  async tokenPrice(tokenAddressInput: string): Promise<TokenPrice> {
    const tokenAddress = getAddress(tokenAddressInput);
    const cacheKey = tokenAddress.toLowerCase();
    const now = Date.now();
    const cached = this.tokenCache.get(cacheKey);
    if (cached && now - Date.parse(cached.updatedAt) < this.cacheMs) {
      return cached;
    }

    const fourMeme = await this.fourMemePrice(tokenAddress);
    const fourMemeLooksBonding = Boolean(
      fourMeme?.priceUsd !== null
        && fourMeme?.priceUsd !== undefined
        && (fourMeme.status === 'PUBLISH' || (fourMeme.progress !== null && fourMeme.progress < 1))
    );
    const publicCandidate = fourMemeLooksBonding ? null : await this.publicOnchainPrice(tokenAddress);
    const shouldPreferFourMeme = Boolean(
      fourMeme?.priceUsd !== null
        && fourMeme?.priceUsd !== undefined
        && (
          !publicCandidate
          || fourMeme.status === 'PUBLISH'
          || (fourMeme.progress !== null && fourMeme.progress < 1)
        )
    );
    const source: TokenPrice['source'] = shouldPreferFourMeme ? 'four_meme' : publicCandidate?.source ?? 'four_meme';
    const priceUsd = shouldPreferFourMeme ? fourMeme?.priceUsd ?? null : publicCandidate?.priceUsd ?? fourMeme?.priceUsd ?? null;
    const liquidityUsd = publicCandidate?.liquidityUsd ?? fourMeme?.liquidityUsd ?? null;
    const lifecycleSource: TokenPrice['lifecycleSource'] = fourMeme ? 'four_meme' : publicCandidate ? 'public_onchain' : 'unavailable';
    const lifecyclePhase = inferLifecyclePhase(fourMeme, publicCandidate);

    const result: TokenPrice = {
      tokenAddress,
      priceUsd,
      source,
      lifecyclePhase,
      updatedAt: nowIso(),
      cacheMs: this.cacheMs,
      available: priceUsd !== null,
      marketCapUsd: fourMeme?.marketCapUsd ?? null,
      progress: fourMeme?.progress ?? null,
      fourMemeStatus: fourMeme?.status ?? null,
      liquidityUsd,
      volume24hUsd: fourMeme?.volume24hUsd ?? null,
      quoteSymbol: fourMeme?.quoteSymbol ?? null,
      lifecycleSource,
      metadata: {
        fourMeme: fourMeme ? {
          status: fourMeme.status,
          holderCount: fourMeme.holderCount,
          quoteSymbol: fourMeme.quoteSymbol,
          progress: fourMeme.progress,
          lifecyclePhase
        } : null,
        publicOnchain: publicCandidate?.metadata ?? null
      }
    };
    this.tokenCache.set(cacheKey, result);
    this.db?.insertTokenPriceSnapshot({
      tokenAddress,
      priceUsd: result.priceUsd,
      source: result.source,
      marketCapUsd: result.marketCapUsd,
      progress: result.progress,
      fourMemeStatus: result.fourMemeStatus,
      liquidityUsd: result.liquidityUsd,
      volume24hUsd: result.volume24hUsd,
      metadata: result.metadata
    });
    this.events.emitEvent({
      type: result.available ? 'market.token_price' : 'market.token_price_unavailable',
      severity: result.available ? 'info' : 'warn',
      message: result.available ? `Token price sync ${tokenAddress}` : `Token price indisponivel ${tokenAddress}`,
      metadata: {
        tokenAddress,
        priceUsd,
        source: result.source,
        lifecyclePhase: result.lifecyclePhase,
        fourMemeStatus: result.fourMemeStatus,
        progress: result.progress,
        marketCapUsd: result.marketCapUsd
      }
    });
    return result;
  }

  private async fourMemePrice(tokenAddress: string): Promise<FourMemePriceContext | null> {
    try {
      const response = await fetch(`${FOUR_MEME_BASE}/private/token/get/v2?address=${tokenAddress}`, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(5000)
      });
      if (!response.ok) return null;
      const payload = ensureObject(await response.json());
      if (Number(payload.code) !== 0) return null;
      const data = ensureObject(payload.data);
      const tokenPrice = ensureObject(data.tokenPrice);
      const priceUsd = parseFiniteNumber(tokenPrice.price ?? data.price);
      const marketCapUsd = parseFiniteNumber(tokenPrice.marketCap ?? data.cap);
      const progress = parseFiniteNumber(tokenPrice.progress ?? data.progress);
      return {
        priceUsd,
        marketCapUsd,
        progress,
        status: data.status ? String(data.status) : null,
        quoteSymbol: data.symbol ? String(data.symbol) : null,
        volume24hUsd: parseFiniteNumber(tokenPrice.dayTrading ?? tokenPrice.tradingUsd ?? data.day1Vol),
        liquidityUsd: parseFiniteNumber(tokenPrice.liquidity),
        holderCount: parseFiniteNumber(tokenPrice.holderCount ?? data.hold),
        raw: data
      };
    } catch {
      return null;
    }
  }

  private async publicOnchainPrice(tokenAddress: string): Promise<PublicPriceCandidate | null> {
    const endpoints: Array<{
      url: string;
      source: PublicPriceCandidate['source'];
      parse: (data: unknown) => PublicPriceCandidate | null;
    }> = [
      {
        url: `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`,
        source: 'dexscreener',
        parse: (data) => {
          const pairs = (data as { pairs?: Array<Record<string, unknown>> }).pairs;
          if (!Array.isArray(pairs)) return null;
          const candidates = pairs
            .filter((pair) => String(pair.chainId).toLowerCase() === 'bsc')
            .map((pair) => {
              const price = parseFiniteNumber(pair.priceUsd);
              const liquidity = pair.liquidity as { usd?: unknown } | undefined;
              return { pair, price, liquidityUsd: parseFiniteNumber(liquidity?.usd) ?? 0 };
            })
            .filter((pair): pair is { pair: Record<string, unknown>; price: number; liquidityUsd: number } => pair.price !== null)
            .sort((a, b) => b.liquidityUsd - a.liquidityUsd);
          const best = candidates[0];
          return best ? {
            priceUsd: best.price,
            source: 'dexscreener',
            liquidityUsd: best.liquidityUsd,
            metadata: {
              pairAddress: best.pair.pairAddress ?? null,
              dexId: best.pair.dexId ?? null
            }
          } : null;
        }
      },
      {
        url: `https://api.coingecko.com/api/v3/onchain/networks/bsc/tokens/${tokenAddress}`,
        source: 'coingecko_onchain',
        parse: (data) => this.parseCoingeckoPrice(data)
      },
      {
        url: `https://api.coingecko.com/api/v3/onchain/networks/bsc/tokens/${tokenAddress}/info`,
        source: 'coingecko_onchain',
        parse: (data) => this.parseCoingeckoPrice(data)
      }
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint.url, { signal: AbortSignal.timeout(5000) });
        if (!response.ok) continue;
        const data = await response.json();
        const parsed = endpoint.parse(data);
        if (parsed !== null) return { ...parsed, source: endpoint.source };
      } catch {
        // Try the next public endpoint; callers get a typed unavailable price if all fail.
      }
    }
    return null;
  }

  private parseCoingeckoPrice(data: unknown): PublicPriceCandidate | null {
    const attributes = (data as { data?: { attributes?: Record<string, unknown> } }).data?.attributes ?? {};
    const priceUsd = parseFiniteNumber(attributes.price_usd ?? attributes.priceUsd ?? attributes.usd_price);
    if (priceUsd === null) return null;
    return {
      priceUsd,
      source: 'coingecko_onchain',
      liquidityUsd: parseFiniteNumber(attributes.reserve_in_usd ?? attributes.liquidity_usd),
      metadata: {
        coingeckoId: (data as { data?: { id?: unknown } }).data?.id ?? null
      }
    };
  }
}

function minuteOpenMs(timestampMs: number): number {
  return Math.floor(timestampMs / 60_000) * 60_000;
}

function parseRequiredPrice(value: unknown, errorCode: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(errorCode);
  return parsed;
}

function inferLifecyclePhase(
  fourMeme: FourMemePriceContext | null,
  publicCandidate: PublicPriceCandidate | null
): TokenPrice['lifecyclePhase'] {
  if (fourMeme?.status === 'PUBLISH' || (fourMeme?.progress !== null && fourMeme?.progress !== undefined && fourMeme.progress < 1)) {
    return 'four_meme_bonding';
  }
  if (publicCandidate || fourMeme?.status === 'TRADE' || (fourMeme?.progress !== null && fourMeme?.progress !== undefined && fourMeme.progress >= 1)) {
    return 'dex_trading';
  }
  return 'unknown';
}
