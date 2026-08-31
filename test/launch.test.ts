import { describe, expect, it } from 'vitest';
import { LaunchService } from '../src/server/launch.js';
import type { MarketService } from '../src/server/market.js';
import { createTestServices } from './helpers.js';

describe('launch dry-run', () => {
  it('creates first-buy queue without signing or broadcasting transactions', async () => {
    const { db, events, wallets, groups } = createTestServices();
    const generated = wallets.generate({ count: 3, labelPrefix: 'BUY' }).wallets;
    db.updateWalletBalance(generated[0].address, '20000000000000000');
    db.updateWalletBalance(generated[1].address, '5000000000000000');
    db.updateWalletBalance(generated[2].address, '10000000000000000');
    const group = groups.create({
      name: 'Launch A',
      campaignName: 'Token A',
      tokenAddress: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'
    });
    groups.pullWallets({ groupId: group.id, count: 3, preview: false });
    db.setWalletDevConfig(generated[0].id, { devRank: 1, devRole: 'creator' });

    const market = {
      bnbPrice: async () => ({
        symbol: 'BNBUSDT',
        priceUsd: 500,
        source: 'binance_spot',
        updatedAt: new Date().toISOString(),
        cacheMs: 30_000
      })
    } as MarketService;
    const launch = new LaunchService(db, market, events);

    const plan = await launch.firstBuysDryRun({
      groupId: group.id,
      tokenAddress: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
      amountBnb: '0.01',
      maxWallets: 3,
      devWalletId: generated[0].id
    });

    expect(plan.dryRunOnly).toBe(true);
    expect(plan.note).toBe('dry_run_only_no_signed_tx_no_broadcast');
    expect(plan.queue).toHaveLength(3);
    expect(plan.queue.filter((item) => item.canAfford)).toHaveLength(2);
    expect(plan.queue.filter((item) => !item.canAfford)).toHaveLength(1);
    expect(plan.totalPlannedUsd).toBe(15);
    expect(plan.queue[0].groupAlias).toBe('Launch A-01');
    expect(plan.devWallet?.walletId).toBe(generated[0].id);
    expect(db.listWalletHistory({ walletId: generated[0].id }).some((row) => row.type === 'launch_dev_wallet_selected')).toBe(true);
    expect(db.walletById(generated[0].id)?.tags).toContain('launch:planned');
  });

  it('supports random range and percent balance amount modes', async () => {
    const { db, events, wallets, groups } = createTestServices();
    const generated = wallets.generate({ count: 2, labelPrefix: 'MODE' }).wallets;
    db.updateWalletBalance(generated[0].address, '100000000000000000');
    db.updateWalletBalance(generated[1].address, '200000000000000000');
    const group = groups.create({ name: 'Launch Modes' });
    groups.pullWallets({ groupId: group.id, count: 2, preview: false });

    const market = {
      bnbPrice: async () => ({
        symbol: 'BNBUSDT',
        priceUsd: 500,
        source: 'binance_spot',
        updatedAt: new Date().toISOString(),
        cacheMs: 30_000
      })
    } as MarketService;
    const launch = new LaunchService(db, market, events);

    const randomPlan = await launch.firstBuysDryRun({
      groupIds: [group.id],
      tokenAddress: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
      amountMode: 'random_range',
      minAmountBnb: '0.01',
      maxAmountBnb: '0.02',
      maxWallets: 2
    });

    expect(randomPlan.amountMode).toBe('random_range');
    for (const item of randomPlan.queue) {
      expect(Number(item.amountBNB)).toBeGreaterThanOrEqual(0.01);
      expect(Number(item.amountBNB)).toBeLessThanOrEqual(0.02);
    }

    const percentPlan = await launch.firstBuysDryRun({
      groupIds: [group.id],
      tokenAddress: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
      amountMode: 'percent_balance',
      balancePercent: '50',
      maxWallets: 2
    });

    expect(percentPlan.queue.map((item) => Number(item.amountBNB)).sort()).toEqual([0.05, 0.1]);
  });

  it('places PRIME wallets first in launch queues', async () => {
    const { db, events, wallets, groups } = createTestServices();
    const generated = wallets.generate({ count: 4, labelPrefix: 'ORDER' }).wallets;
    for (const wallet of generated) db.updateWalletBalance(wallet.address, '100000000000000000');
    const group = groups.create({ name: 'Prime Launch' });
    groups.pullWallets({ groupId: group.id, count: 4, preview: false });
    db.setWalletPrimeRank(generated[2].id, 1);
    db.setWalletPrimeRank(generated[0].id, 2);

    const market = {
      bnbPrice: async () => ({
        symbol: 'BNBUSDT',
        priceUsd: 500,
        source: 'binance_spot',
        updatedAt: new Date().toISOString(),
        cacheMs: 30_000
      })
    } as MarketService;
    const launch = new LaunchService(db, market, events);

    const plan = await launch.firstBuysDryRun({
      groupIds: [group.id],
      tokenAddress: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
      amountMode: 'per_wallet',
      amountBnb: '0.01',
      maxWallets: 4
    });

    expect(plan.queue[0].walletId).toBe(generated[2].id);
    expect(plan.queue[0].primeRank).toBe(1);
    expect(plan.queue[1].walletId).toBe(generated[0].id);
    expect(plan.queue[1].primeRank).toBe(2);
  });
});
