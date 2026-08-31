import { Wallet, getAddress } from 'ethers';
import type { BuneDb } from './db.js';
import type { EventBus } from './events.js';
import { makeId } from './time.js';
import type { WalletHistoryRecord, WalletRecord, WalletTokenPositionRecord } from './types.js';
import { parseWalletImport, toPrivateKeyCsv } from './csv.js';
import { decryptLegacyPrivateKey, verifyLegacyPassword } from './legacyCrypto.js';

function cleanTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return [...new Set(tags.map(String).map((tag) => tag.trim()).filter(Boolean))];
}

function cleanLabelPrefix(prefix: string | undefined, fallback: string): string {
  const cleaned = (prefix || fallback).trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9_-]/g, '').toUpperCase();
  return cleaned || fallback;
}

function indexedLabel(prefix: string, index: number): string {
  return `${prefix}-${String(index).padStart(4, '0')}`;
}

export class WalletService {
  constructor(
    private readonly db: BuneDb,
    private readonly events: EventBus
  ) {}

  generate(input: { count: number; labelPrefix?: string; tags?: string[] }): { created: number; skipped: number; wallets: WalletRecord[] } {
    const count = Number(input.count);
    if (!Number.isInteger(count) || count < 1 || count > 500) throw new Error('wallet_generate_count_1_500');
    const tags = cleanTags(input.tags);
    const prefix = cleanLabelPrefix(input.labelPrefix, 'BUNE');
    let labelIndex = this.db.nextWalletLabelIndex(prefix);
    const createdWallets: WalletRecord[] = [];
    let skipped = 0;

    for (let i = 0; i < count; i += 1) {
      const wallet = Wallet.createRandom();
      const inserted = this.db.insertWallet({
        id: makeId('wal'),
        address: getAddress(wallet.address),
        privateKey: wallet.privateKey,
        label: indexedLabel(prefix, labelIndex),
        tags,
        source: 'generated'
      });
      labelIndex += 1;
      if (!inserted) {
        skipped += 1;
        continue;
      }
      const saved = this.db.walletByAddress(wallet.address);
      if (saved) createdWallets.push(saved);
    }

    this.events.emitEvent({
      type: 'wallets.generated',
      severity: 'info',
      message: `Geradas ${createdWallets.length} wallets`,
      metadata: { count: createdWallets.length, skipped }
    });
    return { created: createdWallets.length, skipped, wallets: createdWallets };
  }

  import(input: { text?: string; csv?: string; tags?: string[] }): { created: number; skipped: number; wallets: WalletRecord[] } {
    const rows = parseWalletImport(input);
    if (rows.length > 500) throw new Error('wallet_import_max_500');
    const wallets: WalletRecord[] = [];
    let skipped = 0;
    let importedLabelIndex = this.db.nextWalletLabelIndex('IMPORTED');

    for (const [index, row] of rows.entries()) {
      const wallet = new Wallet(row.privateKey);
      const address = getAddress(wallet.address);
      if (row.address && getAddress(row.address) !== address) {
        throw new Error(`csv_address_private_key_mismatch_line_${index + 1}`);
      }
      const inserted = this.db.insertWallet({
        id: makeId('wal'),
        address,
        privateKey: wallet.privateKey,
        label: row.label?.trim() ? this.uniqueManualLabel(row.label.trim()) : indexedLabel('IMPORTED', importedLabelIndex++),
        tags: cleanTags(row.tags),
        source: 'imported'
      });
      if (!inserted) {
        skipped += 1;
        continue;
      }
      const saved = this.db.walletByAddress(address);
      if (saved) wallets.push(saved);
    }

    this.events.emitEvent({
      type: 'wallets.imported',
      severity: 'info',
      message: `Importadas ${wallets.length} wallets`,
      metadata: { count: wallets.length, skipped }
    });
    return { created: wallets.length, skipped, wallets };
  }

  watchOnly(input: { address: string; label?: string; tags?: string[] }): WalletRecord {
    const address = getAddress(input.address);
    const existing = this.db.walletByAddress(address);
    if (existing) return existing;
    const tags = [...new Set([...cleanTags(input.tags), 'WATCH_ONLY'])];
    const label = input.label?.trim()
      ? this.uniqueManualLabel(input.label.trim())
      : indexedLabel('WATCH', this.db.nextWalletLabelIndex('WATCH'));
    const inserted = this.db.insertWallet({
      id: makeId('wal'),
      address,
      privateKey: null,
      label,
      tags,
      source: 'watch_only'
    });
    if (!inserted) {
      const race = this.db.walletByAddress(address);
      if (race) return race;
      throw new Error('watch_only_wallet_create_failed');
    }
    const wallet = this.db.walletByAddress(address);
    if (!wallet) throw new Error('watch_only_wallet_create_failed');
    this.events.emitEvent({
      type: 'wallet.watch_only_created',
      severity: 'warn',
      message: `Watch-only criada: ${wallet.label}`,
      metadata: {
        walletId: wallet.id,
        address: wallet.address,
        signer: false,
        exportablePrivateKey: false,
        dryRunOnly: true
      }
    });
    return wallet;
  }

  list(filters: { groupId?: string; status?: string; tag?: string; search?: string }): WalletRecord[] {
    return this.db.listWallets(filters);
  }

  updateLabel(input: { walletId: string; label: string }): WalletRecord {
    const wallet = this.db.updateWalletLabel(input.walletId, input.label);
    this.events.emitEvent({
      type: 'wallet.label_updated',
      severity: 'info',
      message: `Label atualizada: ${wallet.label}`,
      metadata: { walletId: wallet.id, address: wallet.address, label: wallet.label }
    });
    return wallet;
  }

  relabel(input: { walletIds?: string[]; tag?: string; prefix: string; startAt?: number }): { updated: number; prefix: string; wallets: WalletRecord[] } {
    const prefix = cleanLabelPrefix(input.prefix, 'WALLET');
    const walletIds = cleanTags(input.walletIds);
    const targets = walletIds.length
      ? walletIds.map((walletId) => this.db.walletById(walletId)).filter((wallet): wallet is WalletRecord => Boolean(wallet))
      : input.tag?.trim()
        ? this.db.listWallets({ tag: input.tag.trim() })
        : [];
    if (!targets.length) throw new Error('wallet_relabel_no_targets');
    let index = input.startAt && input.startAt > 0 ? input.startAt : this.db.nextWalletLabelIndex(prefix);
    const updated: WalletRecord[] = [];
    for (const wallet of targets.sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      let label = indexedLabel(prefix, index);
      while (this.db.walletLabelExists(label, wallet.id)) {
        index += 1;
        label = indexedLabel(prefix, index);
      }
      index += 1;
      updated.push(this.db.updateWalletLabel(wallet.id, label));
    }
    this.events.emitEvent({
      type: 'wallets.relabelled',
      severity: 'info',
      message: `Renomeadas ${updated.length} wallets para prefixo ${prefix}`,
      metadata: { prefix, count: updated.length, tag: input.tag ?? null, walletIds: walletIds.length ? walletIds : null }
    });
    return { updated: updated.length, prefix, wallets: updated };
  }

  setPrimeRank(walletId: string, primeRank: number | null): WalletRecord {
    const wallet = this.db.setWalletPrimeRank(walletId, primeRank);
    this.events.emitEvent({
      type: 'wallet.prime_rank_updated',
      severity: 'info',
      message: primeRank ? `Wallet ${wallet.label} marcada PRIME ${primeRank}` : `Wallet ${wallet.label} removida de PRIME`,
      metadata: { walletId, address: wallet.address, primeRank }
    });
    return wallet;
  }

  setDevConfig(input: { walletId: string; devRank: number | null; devRole?: string | null; devNotes?: string | null }): WalletRecord {
    const wallet = this.db.setWalletDevConfig(input.walletId, {
      devRank: input.devRank,
      devRole: input.devRole,
      devNotes: input.devNotes
    });
    this.events.emitEvent({
      type: input.devRank === null ? 'wallet.dev_removed' : 'wallet.dev_configured',
      severity: 'info',
      message: input.devRank === null
        ? `Wallet ${wallet.label} removida de DEV`
        : `Wallet ${wallet.label} configurada DEV ${input.devRank}`,
      metadata: {
        walletId: wallet.id,
        address: wallet.address,
        devRank: wallet.devRank,
        devRole: wallet.devRole
      }
    });
    return wallet;
  }

  listDevWallets(): WalletRecord[] {
    return this.db.listDevWallets();
  }

  updateTags(input: { walletId: string; set?: string[]; add?: string[]; remove?: string[] }): WalletRecord {
    const wallet = this.db.updateWalletTags(input.walletId, {
      set: cleanTags(input.set),
      add: cleanTags(input.add),
      remove: cleanTags(input.remove)
    });
    this.events.emitEvent({
      type: 'wallet.tags_updated',
      severity: 'info',
      message: `Tags atualizadas: ${wallet.label}`,
      metadata: { walletId: wallet.id, tags: wallet.tags }
    });
    return wallet;
  }

  history(filters: { walletId?: string; groupId?: string; tokenAddress?: string; limit?: number }): WalletHistoryRecord[] {
    return this.db.listWalletHistory(filters);
  }

  tokenPositions(filters: { walletId?: string; groupId?: string; tokenAddress?: string }): WalletTokenPositionRecord[] {
    return this.db.listWalletTokenPositions(filters);
  }

  exportCsv(input: { walletIds?: string[]; groupId?: string }): string {
    const walletIds = input.groupId
      ? this.db.listWallets({ groupId: input.groupId }).map((wallet) => wallet.id)
      : input.walletIds;
    const rawRows = this.db.walletKeyRows(walletIds);
    const missingKeys = rawRows.filter((row) => !row.private_key && row.vault_ciphertext);
    if (missingKeys.length) {
      throw new Error(`Converta ${missingKeys.length} keys antigas uma vez antes de exportar CSV.`);
    }
    const watchOnlyRows = rawRows.filter((row) => row.source === 'watch_only' || !row.private_key);
    if (watchOnlyRows.length) {
      throw new Error(`Watch-only sem private key nao pode entrar no export CSV (${watchOnlyRows.length}).`);
    }
    const rows = rawRows.map((row) => {
      return {
        address: String(row.address),
        label: String(row.label ?? ''),
        tags: JSON.parse(String(row.tags ?? '[]')) as string[],
        privateKey: String(row.private_key ?? '')
      };
    });

    this.events.emitEvent({
      type: 'wallets.exported_csv',
      severity: 'warn',
      message: `Export CSV bruto de ${rows.length} private keys`,
      metadata: { count: rows.length, groupId: input.groupId ?? null }
    });
    return toPrivateKeyCsv(rows);
  }

  legacyKeySummary(): { encrypted: number } {
    return { encrypted: this.db.legacyEncryptedWalletCount() };
  }

  migrateLegacyEncryptedKeys(password: string): { migrated: number } {
    verifyLegacyPassword(this.db, password);
    const rows = this.db.legacyEncryptedWalletRows();
    for (const row of rows) {
      const privateKey = decryptLegacyPrivateKey({
        salt: String(row.vault_salt),
        iv: String(row.vault_iv),
        authTag: String(row.vault_auth_tag),
        ciphertext: String(row.vault_ciphertext)
      }, password);
      this.db.updateWalletPrivateKey(String(row.id), privateKey);
    }
    this.events.emitEvent({
      type: 'wallets.legacy_keys_migrated',
      severity: 'warn',
      message: `Convertidas ${rows.length} keys antigas para modo simples local`,
      metadata: { count: rows.length }
    });
    return { migrated: rows.length };
  }

  private uniqueManualLabel(base: string): string {
    if (!this.db.walletLabelExists(base)) return base;
    let suffix = 2;
    let label = `${base}-${suffix}`;
    while (this.db.walletLabelExists(label)) {
      suffix += 1;
      label = `${base}-${suffix}`;
    }
    return label;
  }
}
