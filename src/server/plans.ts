import { WebSocketProvider, formatEther, getAddress, parseEther } from 'ethers';
import type { BuneDb } from './db.js';
import type { EventBus } from './events.js';
import type { BscNodePool } from './nodes.js';

export interface BnbTransferPlanInput {
  groupId?: string;
  walletIds?: string[];
  toAddress: string;
  amountBnb: string;
}

export interface BnbTransferPlan {
  dryRunOnly: true;
  chainId: 56;
  node: string;
  gasLimit: string;
  gasPriceWei: string;
  estimatedGasCostWei: string;
  transfers: Array<{
    fromWalletId: string;
    fromAddress: string;
    toAddress: string;
    valueWei: string;
    valueBNB: string;
    currentBalanceWei: string;
    currentBalanceBNB: string;
    canAfford: boolean;
    reason: string | null;
  }>;
}

export class BnbPlanService {
  constructor(
    private readonly db: BuneDb,
    private readonly nodes: BscNodePool,
    private readonly events: EventBus
  ) {}

  async createTransferPlan(input: BnbTransferPlanInput): Promise<BnbTransferPlan> {
    const toAddress = getAddress(input.toAddress);
    const valueWei = parseEther(input.amountBnb || '0');
    if (valueWei <= 0n) throw new Error('amount_bnb_must_be_positive');

    const wsUrls = await this.nodes.bestWsUrls(3);
    let lastError: unknown = null;
    for (const wsUrl of wsUrls) {
      const provider = new WebSocketProvider(wsUrl);
      try {
        const network = await provider.getNetwork();
        if (network.chainId !== 56n) throw new Error(`wrong_chain_${network.chainId.toString()}`);
        const feeData = await provider.getFeeData();
        const gasPrice = feeData.gasPrice ?? parseEther('0.000000003');
        const gasLimit = 21000n;
        const estimatedGasCost = gasPrice * gasLimit;
        const wallets = (input.groupId
          ? this.db.listWallets({ groupId: input.groupId })
          : (input.walletIds ?? []).map((id) => this.db.walletById(id)).filter((wallet) => wallet !== null));

        const transfers = wallets.map((wallet) => {
          const current = BigInt(wallet.balanceWei);
          const required = valueWei + estimatedGasCost;
          const canAfford = current >= required;
          return {
            fromWalletId: wallet.id,
            fromAddress: wallet.address,
            toAddress,
            valueWei: valueWei.toString(),
            valueBNB: formatEther(valueWei),
            currentBalanceWei: current.toString(),
            currentBalanceBNB: formatEther(current),
            canAfford,
            reason: canAfford ? null : 'insufficient_balance_for_value_plus_gas'
          };
        });

        const plan: BnbTransferPlan = {
          dryRunOnly: true,
          chainId: 56,
          node: wsUrl,
          gasLimit: gasLimit.toString(),
          gasPriceWei: gasPrice.toString(),
          estimatedGasCostWei: estimatedGasCost.toString(),
          transfers
        };

        this.events.emitEvent({
          type: 'plans.bnb_transfer_dry_run',
          severity: 'info',
          message: `Plano dry-run BNB criado com ${transfers.length} transferencias`,
          metadata: { count: transfers.length, groupId: input.groupId ?? null, dryRunOnly: true, node: wsUrl, fallbackCandidates: wsUrls.length }
        });

        return plan;
      } catch (error) {
        lastError = error;
      } finally {
        provider.destroy();
      }
    }
    throw lastError instanceof Error ? lastError : new Error('all_bsc_ws_nodes_failed');
  }
}
