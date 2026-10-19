import { describe, expect, it } from 'vitest';
import { PositionService } from '../src/server/positions.js';
import { TerminalService } from '../src/server/terminal.js';
import { createTestServices } from './helpers.js';

const TOKEN = '0x55d398326f99059fF775485246999027B3197955';

describe('position ledger', () => {
  it('records buy lots and consumes them FIFO for realized PnL', () => {
    const { db, events, wallets, groups } = createTestServices();
    const [wallet] = wallets.generate({ count: 1, labelPrefix: 'PNL' }).wallets;
    const group = groups.create({ name: 'PnL Group', campaignName: 'Campaign PNL' });
    groups.pullWallets({ groupId: group.id, count: 1, preview: false });
    const terminal = new TerminalService(db, events);
    const token = terminal.createToken({
      name: 'PnL Token',
      symbol: 'PNL',
      tokenAddress: TOKEN,
      groupId: group.id,
      status: 'live'
    });
    const positions = new PositionService(db, events);

    positions.recordFill({
      walletId: wallet.id,
      tokenId: token.id,
      side: 'buy',
      status: 'confirmed',
      source: 'manual',
      quantityTokens: '100',
      valueUsd: 50
    });
    positions.recordFill({
      walletId: wallet.id,
      tokenId: token.id,
      side: 'buy',
      status: 'confirmed',
      source: 'manual',
      quantityTokens: '50',
      valueUsd: 40
    });
    const sell = positions.recordFill({
      walletId: wallet.id,
      tokenId: token.id,
      side: 'sell',
      status: 'confirmed',
      source: 'manual',
      quantityTokens: '80',
      valueUsd: 120
    });

    expect(sell.costBasisUsd).toBeCloseTo(40);
    expect(sell.realizedPnlUsd).toBeCloseTo(80);
    const summary = positions.summaries({ tokenId: token.id })[0];
    expect(summary.openQuantityTokens).toBe('70');
    expect(summary.openCostBasisUsd).toBeCloseTo(50);
    expect(summary.investedUsd).toBeCloseTo(90);
    expect(summary.soldUsd).toBeCloseTo(120);
    expect(summary.realizedPnlUsd).toBeCloseTo(80);
    expect(db.terminalTokenById(token.id)?.totalHoldings).toBe('70');
  });

  it('keeps launch dry-run cost as pending cost until token quantity exists', () => {
    const { db, events, wallets } = createTestServices();
    const [wallet] = wallets.generate({ count: 1, labelPrefix: 'PLAN' }).wallets;
    const positions = new PositionService(db, events);

    const fill = positions.recordFill({
      walletId: wallet.id,
      tokenAddress: TOKEN,
      tokenSymbol: 'PLAN',
      side: 'buy',
      status: 'planned',
      source: 'launch_dry_run',
      bnbAmount: '0.01',
      bnbPriceUsd: 600,
      metadata: { dryRunOnly: true }
    });

    expect(fill.valueUsd).toBeCloseTo(6);
    expect(db.walletTokenCostBasisUsd(wallet.id, TOKEN)).toBeCloseTo(6);
    const summary = positions.summaries({ tokenAddress: TOKEN })[0];
    expect(summary.pendingCostUsd).toBeCloseTo(6);
    expect(summary.openCostBasisUsd).toBe(0);
    expect(summary.totalPnlUsd).toBe(0);
  });

  it('matches a planned launch fill to a confirmed tx without double counting cost', () => {
    const { db, events, wallets } = createTestServices();
    const [wallet] = wallets.generate({ count: 1, labelPrefix: 'MATCH' }).wallets;
    const positions = new PositionService(db, events);

    const planned = positions.recordFill({
      walletId: wallet.id,
      tokenAddress: TOKEN,
      tokenSymbol: 'MATCH',
      side: 'buy',
      status: 'planned',
      source: 'launch_dry_run',
      bnbAmount: '0.01',
      bnbPriceUsd: 600
    });
    expect(positions.summaries({ tokenAddress: TOKEN })[0].pendingCostUsd).toBeCloseTo(6);

    const confirmed = positions.confirmFill(planned.id, {
      quantityTokens: '1000',
      valueUsd: 6,
      txHash: '0xabc123'
    });
    expect(confirmed.status).toBe('confirmed');
    expect(confirmed.source).toBe('onchain');
    expect(confirmed.txHash).toBe('0xabc123');

    const summary = positions.summaries({ tokenAddress: TOKEN })[0];
    expect(summary.pendingCostUsd).toBe(0);
    expect(summary.openQuantityTokens).toBe('1000');
    expect(summary.openCostBasisUsd).toBeCloseTo(6);
    expect(summary.investedUsd).toBeCloseTo(6);

    const sell = positions.recordFill({
      walletId: wallet.id,
      tokenAddress: TOKEN,
      tokenSymbol: 'MATCH',
      side: 'sell',
      status: 'confirmed',
      source: 'manual',
      quantityTokens: '250',
      valueUsd: 5
    });
    expect(sell.costBasisUsd).toBeCloseTo(1.5);
    expect(sell.realizedPnlUsd).toBeCloseTo(3.5);
    const afterSell = positions.summaries({ tokenAddress: TOKEN })[0];
    expect(afterSell.openQuantityTokens).toBe('750');
    expect(afterSell.realizedPnlUsd).toBeCloseTo(3.5);
  });
});
