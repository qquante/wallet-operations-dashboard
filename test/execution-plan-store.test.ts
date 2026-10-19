import { parseEther } from 'ethers';
import { describe, expect, it } from 'vitest';
import { ExecutionPlanStoreService, hashExecutionPlan } from '../src/server/executionPlanStore.js';
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
    getTransactionCount: async () => 7,
    gasPrice: async () => 3_000_000_000n,
    estimateGas: async () => 100_000n,
    call: async () => '0x',
    destroy: () => undefined
  };
}

function makePlanner(db: ReturnType<typeof createTestServices>['db'], events: ReturnType<typeof createTestServices>['events']): FourMemeExecutionPlanner {
  const trade = new FourMemeTradeService(
    db,
    { bestHttpUrls: async () => ['mock'] } as never,
    {
      tokenPrice: async () => null,
      bnbPrice: async () => ({ symbol: 'BNBUSDT', priceUsd: 600, source: 'binance_spot', updatedAt: new Date().toISOString(), cacheMs: 30000 })
    } as never,
    events
  );
  return new FourMemeExecutionPlanner(
    db,
    { bestHttpUrls: async () => ['mock'], bestWsUrls: async () => [] } as never,
    trade,
    events,
    () => fakeReader()
  );
}

describe('ExecutionPlanStoreService', () => {
  it('persists execution plan hash/version and detects live diff before real mode', async () => {
    const { db, events, wallets, groups } = createTestServices();
    const generated = wallets.generate({ count: 2, labelPrefix: 'SAVE' }).wallets;
    for (const wallet of generated) db.updateWalletBalance(wallet.address, parseEther('0.05').toString());
    const group = groups.create({ name: 'Persist', tokenAddress: TOKEN });
    groups.pullWallets({ groupId: group.id, count: 2, preview: false });

    const planner = makePlanner(db, events);
    const store = new ExecutionPlanStoreService(db, planner, events);
    const plan = await planner.plan({
      tokenAddress: TOKEN,
      side: 'buy',
      groupIds: [group.id],
      fundsBnb: '0.01',
      slippageBps: 500
    });

    const saved = store.save(plan);
    expect(saved.version).toBe('four_meme_execution_plan_v1');
    expect(saved.planHash).toBe(hashExecutionPlan(plan));
    expect(saved.request.tokenAddress).toBe(plan.tokenAddress);
    expect(saved.plan.walletCount).toBe(2);
    expect(store.list({ tokenAddress: TOKEN })).toHaveLength(1);

    const cleanReview = await store.review(saved.id);
    expect(cleanReview.blockedForBroadcast).toBe(true);
    expect(cleanReview.broadcast).toBe(false);
    expect(cleanReview.changed).toBe(false);
    expect(cleanReview.diff).toHaveLength(0);

    const draft = store.finalConfirmationDraft(saved.id);
    expect(draft.status).toBe('draft');
    expect(draft.realModeEnabled).toBe(false);
    expect(draft.broadcast).toBe(false);
    expect(draft.blockingReasons).toContain('confirmation_phrase_required');
    expect(draft.blockingReasons).toContain('real_mode_not_implemented');

    const rejected = store.confirmFinal(saved.id, { confirmationText: 'wrong' });
    expect(rejected.status).toBe('rejected');
    expect(rejected.phraseAccepted).toBe(false);
    expect(rejected.confirmation?.status).toBe('rejected');

    const blocked = store.confirmFinal(saved.id, { confirmationText: draft.requiredPhrase, operatorNote: 'test gate' });
    expect(blocked.status).toBe('blocked');
    expect(blocked.phraseAccepted).toBe(true);
    expect(blocked.readyForFutureRealMode).toBe(true);
    expect(blocked.realModeEnabled).toBe(false);
    expect(blocked.broadcast).toBe(false);
    expect(blocked.blockingReasons).toContain('real_mode_not_implemented');
    expect(blocked.confirmation?.status).toBe('blocked');

    db.updateWalletBalance(generated[0].address, parseEther('0.001').toString());
    const changedReview = await store.review(saved.id);
    expect(changedReview.changed).toBe(true);
    expect(changedReview.diff.some((diff) => diff.path.includes('walletBalanceWei'))).toBe(true);
    expect(changedReview.diff.some((diff) => diff.path.includes('status'))).toBe(true);
    expect(changedReview.saved.status).toBe('reviewed');
  });
});
