import { Contract, WebSocketProvider, formatUnits, getAddress } from 'ethers';
import type { BuneDb } from './db.js';
import type { EventBus } from './events.js';
import type { MarketService } from './market.js';
import type { BscNodePool } from './nodes.js';
import type { WalletRecord } from './types.js';

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)'
];

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

export interface TokenBagRefreshInput {
  groupId?: string;
  groupIds?: string[];
  walletIds?: string[];
  tokenAddress: string;
  costBnbPerWallet?: string;
  walletCostBnb?: Record<string, string>;
}

export interface TokenBagRow {
  walletId: string;
  walletLabel: string;
  address: string;
  primeRank: number | null;
  tokenBalanceRaw: string;
  tokenBalance: string;
  tokenUsdValue: number | null;
  plannedCostUsd: number | null;
  pnlUsd: number | null;
  bnbBalance: string;
}

export interface TokenBagSnapshot {
  chainId: 56;
  node: string;
  tokenAddress: string;
  tokenSymbol: string;
  tokenDecimals: number;
  tokenPriceUsd: number | null;
  tokenPriceSource: string;
  tokenMarketCapUsd: number | null;
  tokenProgress: number | null;
  tokenLifecycleStatus: string | null;
  tokenPriceUpdatedAt: string | null;
  totalTokenBalance: string;
  totalUsdValue: number | null;
  totalPlannedCostUsd: number | null;
  totalPnlUsd: number | null;
  rows: TokenBagRow[];
}

export class TokenBagService {
  constructor(
    private readonly db: BuneDb,
    private readonly nodes: BscNodePool,
    private readonly market: MarketService,
    private readonly events: EventBus
  ) {}

  async refresh(input: TokenBagRefreshInput): Promise<TokenBagSnapshot> {
    const tokenAddress = getAddress(input.tokenAddress);
    const wallets = this.walletsForInput(input);
    const wsUrls = await this.nodes.bestWsUrls(3);
    let lastError: unknown = null;

    for (const wsUrl of wsUrls) {
      const provider = new WebSocketProvider(wsUrl);
      try {
        const network = await provider.getNetwork();
        if (network.chainId !== 56n) throw new Error(`wrong_chain_${network.chainId.toString()}`);

        const token = new Contract(tokenAddress, ERC20_ABI, provider);
        const [symbolResult, decimalsResult, tokenPrice, bnbPrice] = await Promise.all([
          token.symbol().catch(() => 'TOKEN'),
          token.decimals().catch(() => 18),
          this.market.tokenPrice(tokenAddress).catch(() => null),
          this.market.bnbPrice().catch(() => null)
        ]);
        const tokenSymbol = String(symbolResult || 'TOKEN');
        const tokenDecimals = Number(decimalsResult || 18);
        const tokenPriceUsd = tokenPrice?.priceUsd ?? null;

        const rows = await mapLimit(wallets, 8, async (wallet): Promise<TokenBagRow> => {
          const raw = await token.balanceOf(wallet.address) as bigint;
          const tokenBalance = formatUnits(raw, tokenDecimals);
          const numericTokenBalance = Number(tokenBalance);
          const tokenUsdValue = tokenPriceUsd !== null && Number.isFinite(numericTokenBalance)
            ? numericTokenBalance * tokenPriceUsd
            : null;
          const costBnb = Number(input.walletCostBnb?.[wallet.id] ?? input.costBnbPerWallet ?? '0');
          const fallbackPlannedCostUsd = bnbPrice && Number.isFinite(costBnb) && costBnb > 0
            ? costBnb * bnbPrice.priceUsd
            : null;
          const ledgerCostUsd = this.db.walletTokenCostBasisUsd(wallet.id, tokenAddress);
          const plannedCostUsd = ledgerCostUsd ?? fallbackPlannedCostUsd;
          const pnlUsd = tokenUsdValue !== null && plannedCostUsd !== null ? tokenUsdValue - plannedCostUsd : null;
          return {
            walletId: wallet.id,
            walletLabel: wallet.label,
            address: wallet.address,
            primeRank: wallet.primeRank,
            tokenBalanceRaw: raw.toString(),
            tokenBalance,
            tokenUsdValue,
            plannedCostUsd,
            pnlUsd,
            bnbBalance: wallet.balanceBNB
          };
        });

        for (const row of rows) {
          const wallet = wallets.find((item) => item.id === row.walletId);
          const group = wallet?.activeGroupId ? this.db.groupById(wallet.activeGroupId) : null;
          const upsert = this.db.upsertWalletTokenPosition({
            walletId: row.walletId,
            tokenAddress,
            groupId: group?.id ?? input.groupId ?? null,
            campaignName: group?.campaignName ?? null,
            tokenSymbol,
            tokenDecimals,
            tokenBalanceRaw: row.tokenBalanceRaw,
            tokenBalance: row.tokenBalance,
            tokenUsdValue: row.tokenUsdValue,
            plannedCostUsd: row.plannedCostUsd,
            pnlUsd: row.pnlUsd
          });
          if (BigInt(row.tokenBalanceRaw) > 0n || row.plannedCostUsd !== null) {
            this.db.addTagsToWallets([row.walletId], [
              `bag:${tokenSymbol.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 24) || 'token'}`,
              `token:${tokenAddress.slice(0, 6).toLowerCase()}${tokenAddress.slice(-4).toLowerCase()}`
            ]);
          }
          if (upsert.created && (BigInt(row.tokenBalanceRaw) > 0n || row.plannedCostUsd !== null)) {
            this.db.addWalletHistory({
              walletId: row.walletId,
              type: 'token_position_tracked',
              groupId: group?.id ?? input.groupId ?? null,
              tokenAddress,
              tokenSymbol,
              campaignName: group?.campaignName ?? null,
              status: 'observed',
              metadata: {
                tokenBalance: row.tokenBalance,
                tokenUsdValue: row.tokenUsdValue,
                plannedCostUsd: row.plannedCostUsd,
                pnlUsd: row.pnlUsd
              }
            });
          }
        }

        const totalRaw = rows.reduce((sum, row) => sum + BigInt(row.tokenBalanceRaw), 0n);
        const totalTokenBalance = formatUnits(totalRaw, tokenDecimals);
        const totalUsdValue = tokenPriceUsd !== null ? Number(totalTokenBalance) * tokenPriceUsd : null;
        const plannedCosts = rows.map((row) => row.plannedCostUsd).filter((value): value is number => value !== null);
        const totalPlannedCostUsd = plannedCosts.length ? plannedCosts.reduce((sum, value) => sum + value, 0) : null;
        const totalPnlUsd = totalUsdValue !== null && totalPlannedCostUsd !== null ? totalUsdValue - totalPlannedCostUsd : null;

        const snapshot: TokenBagSnapshot = {
          chainId: 56,
          node: wsUrl,
          tokenAddress,
          tokenSymbol,
          tokenDecimals,
          tokenPriceUsd,
          tokenPriceSource: tokenPrice?.source ?? 'coingecko_onchain',
          tokenMarketCapUsd: tokenPrice?.marketCapUsd ?? null,
          tokenProgress: tokenPrice?.progress ?? null,
          tokenLifecycleStatus: tokenPrice?.fourMemeStatus ?? null,
          tokenPriceUpdatedAt: tokenPrice?.updatedAt ?? null,
          totalTokenBalance,
          totalUsdValue,
          totalPlannedCostUsd,
          totalPnlUsd,
          rows
        };

        this.events.emitEvent({
          type: 'token_bag.refresh_completed',
          severity: 'info',
          message: `Bag ${tokenSymbol} atualizada para ${rows.length} wallets`,
          metadata: {
            tokenAddress,
            tokenSymbol,
            groupId: input.groupId ?? null,
            count: rows.length,
            node: wsUrl,
            priceUsd: tokenPriceUsd
          }
        });

        return snapshot;
      } catch (error) {
        lastError = error;
        this.events.emitEvent({
          type: 'token_bag.refresh_fallback',
          severity: 'warn',
          message: error instanceof Error ? error.message : 'Falha ao ler bag; tentando fallback',
          metadata: { node: wsUrl, tokenAddress }
        });
      } finally {
        provider.destroy();
      }
    }

    throw lastError instanceof Error ? lastError : new Error('all_bsc_ws_nodes_failed');
  }

  private walletsForInput(input: TokenBagRefreshInput): WalletRecord[] {
    if (input.groupId) return this.db.listWallets({ groupId: input.groupId });
    if (input.groupIds?.length) {
      const seen = new Set<string>();
      return input.groupIds.flatMap((groupId) => this.db.listWallets({ groupId }))
        .filter((wallet) => {
          if (seen.has(wallet.id)) return false;
          seen.add(wallet.id);
          return true;
        });
    }
    if (input.walletIds?.length) {
      return input.walletIds
        .map((id) => this.db.walletById(id))
        .filter((wallet): wallet is WalletRecord => wallet !== null);
    }
    throw new Error('group_or_wallet_ids_required');
  }
}
