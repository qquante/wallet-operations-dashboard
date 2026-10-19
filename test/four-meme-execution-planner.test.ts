import { parseEther } from 'ethers';
import { describe, expect, it } from 'vitest';
import { FourMemeExecutionPlanner } from '../src/server/fourMemeExecutionPlanner.js';
import { FourMemeTradeService, type FourMemeChainReader } from '../src/server/fourMemeTrade.js';
import { createTestServices } from './helpers.js';

const TOKEN = '0x1111111111111111111111111111111111114444';
const MANAGER = '0x5c952063c7fc8610FFDB798152D69F0B9550762b';

function fakeReader(): FourMemeChainReader {
  return {
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
    quoteBuy: async (_token, _amount, funds) => ({
      tokenManager: MANAGER,
      quote: null,
      estimatedAmount: parseEther('1000').toString(),
      estimatedCost: funds.toString(),
      estimatedFee: '0',
      amountMsgValue: funds.toString(),
      amountApproval: '0',
      amountFunds: funds.toString()
    }),
    quoteSell: async () => ({
      tokenManager: MANAGER,
      quote: null,
      funds: parseEther('0.02').toString(),
      fee: parseEther('0.0002').toString()
    }),
    getTransactionCount: async (address) => address.toLowerCase().endsWith('1') ? 11 : 22,
    gasPrice: async () => 3_000_000_000n,
    estimateGas: async () => 100_000n,
    call: async () => '0x',
    destroy: () => undefined
  };
}

describe('FourMemeExecutionPlanner', () => {
  it('orders PRIME wallets first and totals dry-run gas/native requirements', async () => {
    const { db, events, wallets, groups } = createTestServices();
    const generated = wallets.generate({ count: 3, labelPrefix: 'EXEC' }).wallets;
    for (const wallet of generated) db.updateWalletBalance(wallet.address, parseEther('0.05').toString());
    const group = groups.create({ name: 'Exec', tokenAddress: TOKEN });
    groups.pullWallets({ groupId: group.id, count: 3, preview: false });
    db.setWalletPrimeRank(generated[2].id, 1);

    const trade = new FourMemeTradeService(
      db,
      { bestHttpUrls: async () => ['mock'] } as never,
      {
        tokenPrice: async () => null,
        bnbPrice: async () => ({ symbol: 'BNBUSDT', priceUsd: 600, source: 'binance_spot', updatedAt: new Date().toISOString(), cacheMs: 30000 })
      } as never,
      events
    );
    const planner = new FourMemeExecutionPlanner(
      db,
      { bestHttpUrls: async () => ['mock'], bestWsUrls: async () => [] } as never,
      trade,
      events,
      () => fakeReader()
    );

    const plan = await planner.plan({
      tokenAddress: TOKEN,
      side: 'buy',
      groupIds: [group.id],
      fundsBnb: '0.01',
      walletSlippageBps: { [generated[2].id]: 250 }
    });

    expect(plan.readOnly).toBe(true);
    expect(plan.broadcast).toBe(false);
    expect(plan.blockedForBroadcast).toBe(true);
    expect(plan.rows).toHaveLength(3);
    expect(plan.rows[0].walletId).toBe(generated[2].id);
    expect(plan.rows[0].primeRank).toBe(1);
    expect(plan.rows[0].slippageBps).toBe(250);
    expect(plan.rows[0].tradeNonce).toBe(plan.rows[0].nonceBase);
    expect(plan.rows[0].gas.tradeGasUnits).toBe('100000');
    expect(plan.rows[0].requiredNativeBNB).toBe('0.0103');
    expect(plan.totals.tradeValueBNB).toBe('0.03');
    expect(plan.totals.gasCostBNB).toBe('0.0009');
    expect(plan.totals.requiredNativeBNB).toBe('0.0309');
    expect(plan.totals.ready).toBe(3);
  });
});
