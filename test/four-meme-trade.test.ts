import { Interface, parseEther } from 'ethers';
import { describe, expect, it } from 'vitest';
import { FourMemeTradeService, type FourMemeChainReader } from '../src/server/fourMemeTrade.js';
import { createTestServices } from './helpers.js';

const TOKEN = '0x1111111111111111111111111111111111114444';
const MANAGER = '0x5c952063c7fc8610FFDB798152D69F0B9550762b';
const TM2 = new Interface(['function buyTokenAMAP(address token, uint256 funds, uint256 minAmount) payable']);

describe('FourMemeTradeService', () => {
  it('builds a read-only Four.meme buy dry-run without broadcasting', async () => {
    const { db, events, wallets } = createTestServices();
    const [wallet] = wallets.generate({ count: 1, labelPrefix: 'FM' }).wallets;
    const reader: FourMemeChainReader = {
      chainId: async () => 56n,
      tokenInfo: async () => ({
        version: 2,
        tokenManager: MANAGER,
        quote: null,
        lastPrice: '1',
        tradingFeeRate: 0.01,
        minTradingFee: '0',
        launchTime: 1780000000,
        offers: '1',
        maxOffers: '10',
        funds: '1',
        maxFunds: '10',
        liquidityAdded: false
      }),
      quoteBuy: async () => ({
        tokenManager: MANAGER,
        quote: null,
        estimatedAmount: parseEther('1000').toString(),
        estimatedCost: parseEther('0.01').toString(),
        estimatedFee: parseEther('0.0001').toString(),
        amountMsgValue: parseEther('0.01').toString(),
        amountApproval: '0',
        amountFunds: parseEther('0.01').toString()
      }),
      quoteSell: async () => {
        throw new Error('unexpected_sell');
      },
      getTransactionCount: async () => 7,
      gasPrice: async () => 3_000_000_000n,
      estimateGas: async () => 123456n,
      call: async () => '0x',
      destroy: () => undefined
    };
    const service = new FourMemeTradeService(
      db,
      { bestHttpUrls: async () => ['mock'] } as never,
      {
        tokenPrice: async () => ({
          tokenAddress: TOKEN,
          priceUsd: 0.00001,
          source: 'four_meme',
          lifecyclePhase: 'four_meme_bonding',
          updatedAt: new Date().toISOString(),
          cacheMs: 30000,
          available: true,
          marketCapUsd: 10000,
          progress: 0.5,
          fourMemeStatus: 'PUBLISH',
          liquidityUsd: 0,
          volume24hUsd: 1,
          quoteSymbol: 'BNB',
          lifecycleSource: 'four_meme',
          metadata: {}
        }),
        bnbPrice: async () => ({ symbol: 'BNBUSDT', priceUsd: 600, source: 'binance_spot', updatedAt: new Date().toISOString(), cacheMs: 30000 })
      } as never,
      events
    );

    const plan = await service.tradeDryRunWithReader(reader, 'mock', {
      tokenAddress: TOKEN,
      side: 'buy',
      buyMode: 'funds',
      fundsBnb: '0.01',
      walletId: wallet.id,
      slippageBps: 500
    });
    const decoded = TM2.decodeFunctionData('buyTokenAMAP', plan.tx.calldata);

    expect(plan.readOnly).toBe(true);
    expect(plan.broadcast).toBe(false);
    expect(plan.tx.functionName).toBe('buyTokenAMAP');
    expect(plan.tx.valueBNB).toBe('0.01');
    expect(plan.simulation.estimateGas).toBe('123456');
    expect(decoded[0]).toBe(TOKEN);
    expect(decoded[1]).toBe(parseEther('0.01'));
    expect(decoded[2]).toBe(parseEther('950'));
  });
});
