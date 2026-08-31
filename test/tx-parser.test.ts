import { Interface, parseEther, parseUnits } from 'ethers';
import { describe, expect, it } from 'vitest';
import { TxParserService } from '../src/server/txParser.js';
import { createTestServices } from './helpers.js';

const TOKEN = '0x1111111111111111111111111111111111111111';
const ROUTER = '0x2222222222222222222222222222222222222222';
const TX_HASH = '0xabc123';
const TRANSFER = new Interface(['event Transfer(address indexed from, address indexed to, uint256 value)']);

describe('tx parser', () => {
  it('previews a read-only buy fill from tx receipt transfer logs', async () => {
    const { db, wallets } = createTestServices();
    const [wallet] = wallets.generate({ count: 1, labelPrefix: 'TXP' }).wallets;
    const encoded = TRANSFER.encodeEventLog(TRANSFER.getEvent('Transfer')!, [
      ROUTER,
      wallet.address,
      parseUnits('1234.5', 18)
    ]);
    const provider = {
      async getNetwork() {
        return { chainId: 56n };
      },
      async getTransaction() {
        return {
          hash: TX_HASH,
          from: wallet.address,
          to: ROUTER,
          value: parseEther('0.02'),
          gasPrice: 3_000_000_000n
        };
      },
      async getTransactionReceipt() {
        return {
          blockNumber: 123,
          status: 1,
          gasUsed: 100_000n,
          logs: [{
            address: TOKEN,
            topics: encoded.topics,
            data: encoded.data,
            index: 7
          }]
        };
      },
      async getBlock() {
        return { timestamp: 1780000000 };
      }
    };
    const service = new TxParserService(
      db,
      { bestHttpUrls: async () => ['mock'] } as never,
      {
        bnbPrice: async () => ({ symbol: 'BNBUSDT', priceUsd: 600, source: 'binance_spot', updatedAt: new Date().toISOString() }),
        bnbPriceAt: async () => ({
          symbol: 'BNBUSDT',
          priceUsd: 500,
          source: 'binance_spot_kline',
          interval: '1m',
          timestamp: 1780000000,
          openTimeMs: 1780000000000,
          closeTimeMs: 1780000059999,
          openUsd: 499,
          highUsd: 501,
          lowUsd: 498,
          closeUsd: 500,
          volume: '1',
          updatedAt: new Date().toISOString()
        })
      } as never,
      async () => ({ symbol: 'MOON', decimals: 18 }),
      { isEnabled: () => false, txData: async () => ({ enabled: false, source: 'etherscan_v2', internalTxs: [], tokenTransfers: [], warnings: [] }) } as never
    );

    const preview = await service.previewWithProvider(provider as never, 'mock', {
      txHash: TX_HASH,
      walletId: wallet.id,
      tokenAddress: TOKEN
    });

    expect(preview.readOnly).toBe(true);
    expect(preview.status).toBe('success');
    expect(preview.suggestion).toMatchObject({
      side: 'buy',
      tokenAddress: TOKEN,
      tokenSymbol: 'MOON',
      quantityTokens: '1234.5',
      bnbAmount: '0.02',
      confidence: 'high'
    });
    expect(preview.bnbPrice).toMatchObject({
      priceUsd: 500,
      historical: true,
      source: 'binance_spot_kline'
    });
    expect(preview.suggestion.valueUsd).toBeCloseTo(10);
    expect(preview.transfers[0]).toMatchObject({
      direction: 'in',
      amount: '1234.5'
    });
  });

  it('uses Etherscan internal txs to estimate sell proceeds when receipt has no native value', async () => {
    const { db, wallets } = createTestServices();
    const [wallet] = wallets.generate({ count: 1, labelPrefix: 'TXS' }).wallets;
    const encoded = TRANSFER.encodeEventLog(TRANSFER.getEvent('Transfer')!, [
      wallet.address,
      ROUTER,
      parseUnits('500', 18)
    ]);
    const provider = {
      async getNetwork() {
        return { chainId: 56n };
      },
      async getTransaction() {
        return {
          hash: TX_HASH,
          from: wallet.address,
          to: ROUTER,
          value: 0n,
          gasPrice: 3_000_000_000n
        };
      },
      async getTransactionReceipt() {
        return {
          blockNumber: 456,
          status: 1,
          gasUsed: 100_000n,
          logs: [{
            address: TOKEN,
            topics: encoded.topics,
            data: encoded.data,
            index: 1
          }]
        };
      },
      async getBlock() {
        return { timestamp: 1780001000 };
      }
    };
    const service = new TxParserService(
      db,
      { bestHttpUrls: async () => ['mock'] } as never,
      { bnbPrice: async () => ({ symbol: 'BNBUSDT', priceUsd: 600, source: 'binance_spot', updatedAt: new Date().toISOString() }) } as never,
      async () => ({ symbol: 'MOON', decimals: 18 }),
      {
        isEnabled: () => true,
        txData: async () => ({
          enabled: true,
          source: 'etherscan_v2',
          internalTxs: [{
            blockNumber: '456',
            from: ROUTER,
            to: wallet.address,
            value: parseEther('0.03').toString(),
            isError: '0'
          }],
          tokenTransfers: [],
          warnings: []
        })
      } as never
    );

    const preview = await service.previewWithProvider(provider as never, 'mock', {
      txHash: TX_HASH,
      walletId: wallet.id,
      tokenAddress: TOKEN,
      side: 'sell'
    });

    expect(preview.suggestion).toMatchObject({
      side: 'sell',
      quantityTokens: '500.0',
      bnbAmount: '0.03',
      confidence: 'high'
    });
    expect(preview.explorer.internalTxs).toBe(1);
    expect(preview.suggestion.valueUsd).toBeCloseTo(18);
  });
});
