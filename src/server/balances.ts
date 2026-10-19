import { WebSocketProvider, formatEther } from 'ethers';
import type { BuneDb } from './db.js';
import type { EventBus } from './events.js';
import type { BscNodePool } from './nodes.js';
import type { WalletRecord } from './types.js';

async function mapLimit<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await mapper(items[current]);
    }
  });
  await Promise.all(workers);
  return results;
}

export class BalanceService {
  private refreshing = false;
  private providers: WebSocketProvider[] = [];
  private lastBlockEventAt = new Map<string, number>();

  constructor(
    private readonly db: BuneDb,
    private readonly nodes: BscNodePool,
    private readonly events: EventBus
  ) {}

  async refresh(input: { walletIds?: string[]; groupId?: string; all?: boolean } = {}): Promise<{ updated: number; node: string }> {
    if (this.refreshing) throw new Error('balance_refresh_already_running');
    this.refreshing = true;
    let lastError: unknown = null;
    try {
      const wsUrls = await this.nodes.bestWsUrls(3);
      for (const wsUrl of wsUrls) {
        const provider = new WebSocketProvider(wsUrl);
        try {
          const network = await provider.getNetwork();
          if (network.chainId !== 56n) throw new Error(`wrong_chain_${network.chainId.toString()}`);

          let wallets: WalletRecord[];
          if (input.groupId) wallets = this.db.listWallets({ groupId: input.groupId });
          else if (input.walletIds?.length) wallets = input.walletIds.map((id) => this.db.walletById(id)).filter(Boolean) as WalletRecord[];
          else wallets = this.db.listWallets();

          await mapLimit(wallets, 8, async (wallet) => {
            const balance = await provider.getBalance(wallet.address);
            this.db.updateWalletBalance(wallet.address, balance.toString());
            this.events.emitEvent({
              type: 'wallet.balance_updated',
              severity: 'info',
              message: `Saldo atualizado: ${wallet.address}`,
              metadata: { address: wallet.address, balanceWei: balance.toString(), balanceBNB: formatEther(balance), node: wsUrl }
            });
          });

          this.events.emitEvent({
            type: 'balances.refresh_completed',
            severity: 'info',
            message: `Refresh de saldo concluido para ${wallets.length} wallets`,
            metadata: { count: wallets.length, node: wsUrl, fallbackCandidates: wsUrls.length }
          });
          return { updated: wallets.length, node: wsUrl };
        } catch (error) {
          lastError = error;
          this.events.emitEvent({
            type: 'nodes.refresh_fallback',
            severity: 'warn',
            message: error instanceof Error ? error.message : 'Falha no node de refresh; tentando fallback',
            metadata: { node: wsUrl }
          });
        } finally {
          provider.destroy();
        }
      }
      throw lastError instanceof Error ? lastError : new Error('all_bsc_ws_nodes_failed');
    } finally {
      this.refreshing = false;
    }
  }

  async startBlockWatcher(): Promise<void> {
    try {
      const wsUrls = await this.nodes.bestWsUrls(3);
      for (const wsUrl of wsUrls) {
        const provider = new WebSocketProvider(wsUrl);
        this.providers.push(provider);
        try {
          const network = await provider.getNetwork();
          if (network.chainId !== 56n) throw new Error(`wrong_chain_${network.chainId.toString()}`);
          provider.on('block', (blockNumber) => {
            const now = Date.now();
            const last = this.lastBlockEventAt.get(wsUrl) ?? 0;
            if (now - last < 15_000) return;
            this.lastBlockEventAt.set(wsUrl, now);
            this.events.emitEvent({
              type: 'bsc.block',
              severity: 'info',
              message: `Novo bloco BSC ${blockNumber}`,
              metadata: { blockNumber, node: wsUrl, activeWs: this.providers.length }
            });
          });
          this.events.emitEvent({
            type: 'nodes.connected',
            severity: 'info',
            message: 'Watcher WS conectado na BNB Chain',
            metadata: { node: wsUrl, activeWs: this.providers.length }
          });
        } catch (error) {
          provider.destroy();
          this.providers = this.providers.filter((item) => item !== provider);
          this.events.emitEvent({
            type: 'nodes.connection_failed',
            severity: 'warn',
            message: error instanceof Error ? error.message : 'Falha ao conectar watcher BSC',
            metadata: { node: wsUrl }
          });
        }
      }
      if (!this.providers.length) throw new Error('all_bsc_ws_watchers_failed');
    } catch (error) {
      this.events.emitEvent({
        type: 'nodes.connection_failed',
        severity: 'warn',
        message: error instanceof Error ? error.message : 'Falha ao conectar watchers BSC',
        metadata: {}
      });
    }
  }

  stopBlockWatcher(): void {
    for (const provider of this.providers) {
      provider.destroy();
    }
    this.providers = [];
    this.lastBlockEventAt.clear();
  }
}
