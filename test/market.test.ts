import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTestServices } from './helpers.js';
import { MarketService } from '../src/server/market.js';

describe('MarketService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches and caches BNBUSDT price', async () => {
    const { events } = createTestServices();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ symbol: 'BNBUSDT', price: '712.34' })
    } as Response);

    const market = new MarketService(events);
    const first = await market.bnbPrice();
    const second = await market.bnbPrice();

    expect(first.priceUsd).toBe(712.34);
    expect(second.priceUsd).toBe(712.34);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fetches and stores historical BNBUSDT 1m candle by timestamp', async () => {
    const { db, events } = createTestServices();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ([[
        1783547100000,
        '566.03000000',
        '566.44000000',
        '566.03000000',
        '566.30000000',
        '109.31500000',
        1783547159999,
        '61901.47561000',
        285
      ]])
    } as Response);

    const market = new MarketService(events, db);
    const first = await market.bnbPriceAt(1783547115);
    const second = await market.bnbPriceAt(1783547130);
    const stored = db.bnbPriceSnapshotAt(1783547115 * 1000);

    expect(first).toMatchObject({
      priceUsd: 566.3,
      source: 'binance_spot_kline',
      openTimeMs: 1783547100000,
      closeTimeMs: 1783547159999,
      closeUsd: 566.3
    });
    expect(second.priceUsd).toBe(566.3);
    expect(stored?.priceUsd).toBe(566.3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fetches token price from public onchain market data', async () => {
    const { db, events } = createTestServices();
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          code: 0,
          data: {
            status: 'TRADE',
            symbol: 'BNB',
            tokenPrice: { price: '0.0040', marketCap: '4000', progress: '1' }
          }
        })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          pairs: [
            { chainId: 'bsc', priceUsd: '0.0042', liquidity: { usd: 1000 }, pairAddress: '0xpair' },
            { chainId: 'bsc', priceUsd: '0.0041', liquidity: { usd: 10 } }
          ]
        })
      } as Response);

    const market = new MarketService(events, db);
    const first = await market.tokenPrice('0x55d398326f99059fF775485246999027B3197955');
    const second = await market.tokenPrice('0x55d398326f99059fF775485246999027B3197955');

    expect(first.priceUsd).toBe(0.0042);
    expect(first.available).toBe(true);
    expect(first.source).toBe('dexscreener');
    expect(first.lifecyclePhase).toBe('dex_trading');
    expect(first.fourMemeStatus).toBe('TRADE');
    expect(first.progress).toBe(1);
    expect(second.priceUsd).toBe(0.0042);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(db.listTokenPriceSnapshots('0x55d398326f99059fF775485246999027B3197955')).toHaveLength(1);
  });

  it('uses Four.meme price for bonding curve tokens before DEX price', async () => {
    const { db, events } = createTestServices();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 0,
        data: {
          status: 'PUBLISH',
          symbol: 'BNB',
          tokenPrice: {
            price: '0.0000000057',
            marketCap: '5.7',
            progress: '0.25',
            dayTrading: '123.45',
            holderCount: 42
          }
        }
      })
    } as Response);

    const market = new MarketService(events, db);
    const price = await market.tokenPrice('0x55d398326f99059fF775485246999027B3197955');
    const snapshots = db.listTokenPriceSnapshots('0x55d398326f99059fF775485246999027B3197955');

    expect(price).toMatchObject({
      priceUsd: 0.0000000057,
      source: 'four_meme',
      lifecyclePhase: 'four_meme_bonding',
      marketCapUsd: 5.7,
      progress: 0.25,
      fourMemeStatus: 'PUBLISH',
      volume24hUsd: 123.45,
      available: true
    });
    expect(snapshots[0]).toMatchObject({
      priceUsd: 0.0000000057,
      source: 'four_meme',
      marketCapUsd: 5.7,
      progress: 0.25,
      fourMemeStatus: 'PUBLISH'
    });
  });
});
