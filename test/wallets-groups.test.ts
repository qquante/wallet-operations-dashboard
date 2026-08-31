import { Wallet } from 'ethers';
import { describe, expect, it } from 'vitest';
import { createTestServices } from './helpers.js';

describe('wallet and group management', () => {
  it('generates wallets and dedupes imported private keys', () => {
    const { wallets } = createTestServices();
    const generated = wallets.generate({ count: 3, labelPrefix: 'TEST', tags: ['fresh'] });
    expect(generated.created).toBe(3);

    const external = Wallet.createRandom();
    const imported = wallets.import({ text: `${external.privateKey}\n${external.privateKey}` });
    expect(imported.created).toBe(1);
    expect(imported.skipped).toBe(1);
  });

  it('keeps generated labels unique across batches with the same prefix', () => {
    const { wallets } = createTestServices();
    const first = wallets.generate({ count: 3, labelPrefix: 'BUNE' }).wallets;
    const second = wallets.generate({ count: 2, labelPrefix: 'BUNE' }).wallets;

    expect([...first, ...second].map((wallet) => wallet.label)).toEqual([
      'BUNE-0001',
      'BUNE-0002',
      'BUNE-0003',
      'BUNE-0004',
      'BUNE-0005'
    ]);
  });

  it('creates watch-only wallets for read-only simulation and blocks key export', () => {
    const { wallets } = createTestServices();
    const address = '0x8894E0a0c962CB723c1976a4421c95949bE2D4E3';

    const watch = wallets.watchOnly({ address, label: 'SIM-BNB-WHALE', tags: ['SIM_READY'] });
    const duplicate = wallets.watchOnly({ address, label: 'OTHER' });

    expect(watch.source).toBe('watch_only');
    expect(watch.tags).toContain('WATCH_ONLY');
    expect(duplicate.id).toBe(watch.id);
    expect(() => wallets.exportCsv({ walletIds: [watch.id] })).toThrow('Watch-only sem private key');
  });

  it('renames wallets by tag using a unique indexed prefix', () => {
    const { wallets } = createTestServices();
    wallets.generate({ count: 2, labelPrefix: 'BUNE', tags: ['DEV'] });
    wallets.generate({ count: 1, labelPrefix: 'BUNE', tags: ['BUY'] });

    const result = wallets.relabel({ tag: 'DEV', prefix: 'DEV', startAt: 1 });

    expect(result.updated).toBe(2);
    expect(result.wallets.map((wallet) => wallet.label)).toEqual(['DEV-0001', 'DEV-0002']);
    expect(wallets.list({ tag: 'BUY' })[0].label).toBe('BUNE-0003');
  });

  it('blocks manual duplicate wallet labels', () => {
    const { wallets } = createTestServices();
    const generated = wallets.generate({ count: 2, labelPrefix: 'WAL' }).wallets;

    expect(() => wallets.updateLabel({ walletId: generated[1].id, label: generated[0].label })).toThrow('wallet_label_already_exists');
  });

  it('pulls available wallets by highest BNB balance and reserves them', () => {
    const { db, wallets, groups } = createTestServices();
    const generated = wallets.generate({ count: 3, labelPrefix: 'SEL' }).wallets;
    db.updateWalletBalance(generated[0].address, '100');
    db.updateWalletBalance(generated[1].address, '300');
    db.updateWalletBalance(generated[2].address, '200');
    const group = groups.create({ name: 'Campaign A' });

    const preview = groups.pullWallets({ groupId: group.id, count: 2, preview: true });
    expect(preview.wallets.map((wallet) => wallet.address)).toEqual([generated[1].address, generated[2].address]);

    const reserved = groups.pullWallets({ groupId: group.id, count: 2, preview: false });
    expect(reserved.wallets.filter((wallet) => wallet.status === 'reserved')).toHaveLength(2);
    expect(db.listWallets({ status: 'available' })).toHaveLength(1);
  });

  it('keeps PRIME ranks unique across wallets', () => {
    const { db, wallets } = createTestServices();
    const generated = wallets.generate({ count: 2, labelPrefix: 'PRIME' }).wallets;

    db.setWalletPrimeRank(generated[0].id, 1);
    db.setWalletPrimeRank(generated[1].id, 1);

    expect(db.walletById(generated[0].id)?.primeRank).toBeNull();
    expect(db.walletById(generated[1].id)?.primeRank).toBe(1);
  });

  it('configures DEV wallet slots and keeps ranks unique', () => {
    const { wallets } = createTestServices();
    const generated = wallets.generate({ count: 2, labelPrefix: 'DEV' }).wallets;

    const first = wallets.setDevConfig({ walletId: generated[0].id, devRank: 1, devRole: 'creator', devNotes: 'main launcher' });
    expect(first.devRank).toBe(1);
    expect(first.devRole).toBe('creator');
    expect(first.tags).toContain('DEV');

    const second = wallets.setDevConfig({ walletId: generated[1].id, devRank: 1, devRole: 'backup' });
    expect(second.devRank).toBe(1);
    expect(wallets.list({}).find((wallet) => wallet.id === generated[0].id)?.devRank).toBeNull();
    expect(wallets.listDevWallets()).toHaveLength(1);
    expect(wallets.history({ walletId: generated[1].id }).some((row) => row.type === 'dev_wallet_configured')).toBe(true);
  });

  it('updates wallet tags and records history', () => {
    const { wallets } = createTestServices();
    const wallet = wallets.generate({ count: 1, labelPrefix: 'TAG', tags: ['old'] }).wallets[0];

    const updated = wallets.updateTags({ walletId: wallet.id, add: ['launch:abc', 'old'], remove: ['old'] });

    expect(updated.tags).toEqual(['launch:abc']);
    expect(wallets.history({ walletId: wallet.id })[0].type).toBe('wallet_tags_updated');
  });
});
