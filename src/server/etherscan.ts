const DEFAULT_ETHERSCAN_V2_BASE = 'https://api.etherscan.io/v2/api';

export interface EtherscanInternalTx {
  blockNumber: string;
  timeStamp?: string;
  from: string;
  to: string;
  value: string;
  contractAddress?: string;
  input?: string;
  type?: string;
  gas?: string;
  gasUsed?: string;
  isError?: string;
  errCode?: string;
}

export interface EtherscanTokenTransfer {
  blockNumber: string;
  timeStamp?: string;
  hash: string;
  from: string;
  to: string;
  value: string;
  contractAddress: string;
  tokenName?: string;
  tokenSymbol?: string;
  tokenDecimal?: string;
  transactionIndex?: string;
  gas?: string;
  gasPrice?: string;
  gasUsed?: string;
}

export interface EtherscanTxData {
  enabled: boolean;
  source: 'etherscan_v2';
  internalTxs: EtherscanInternalTx[];
  tokenTransfers: EtherscanTokenTransfer[];
  warnings: string[];
}

interface EtherscanResponse<T> {
  status: string;
  message: string;
  result: T[] | string;
}

export class EtherscanV2Client {
  constructor(
    private readonly apiKey = process.env.ETHERSCAN_API_KEY ?? '',
    private readonly baseUrl = process.env.ETHERSCAN_API_BASE ?? DEFAULT_ETHERSCAN_V2_BASE
  ) {}

  isEnabled(): boolean {
    return Boolean(this.apiKey.trim());
  }

  async txData(input: {
    txHash: string;
    walletAddress?: string | null;
    tokenAddress?: string | null;
    blockNumber?: number | null;
  }): Promise<EtherscanTxData> {
    if (!this.isEnabled()) {
      return { enabled: false, source: 'etherscan_v2', internalTxs: [], tokenTransfers: [], warnings: ['etherscan_api_key_missing'] };
    }
    const warnings: string[] = [];
    const [internalTxs, tokenTransfers] = await Promise.all([
      this.internalTxsByHash(input.txHash).catch((error) => {
        warnings.push(`etherscan_internal_failed:${error instanceof Error ? error.message : 'unknown'}`);
        return [] as EtherscanInternalTx[];
      }),
      input.walletAddress && input.blockNumber
        ? this.tokenTransfersByWalletBlock({
          txHash: input.txHash,
          walletAddress: input.walletAddress,
          tokenAddress: input.tokenAddress,
          blockNumber: input.blockNumber
        }).catch((error) => {
          warnings.push(`etherscan_tokentx_failed:${error instanceof Error ? error.message : 'unknown'}`);
          return [] as EtherscanTokenTransfer[];
        })
        : Promise.resolve([] as EtherscanTokenTransfer[])
    ]);
    return { enabled: true, source: 'etherscan_v2', internalTxs, tokenTransfers, warnings };
  }

  private async internalTxsByHash(txHash: string): Promise<EtherscanInternalTx[]> {
    const data = await this.fetchAccount<EtherscanInternalTx>({
      action: 'txlistinternal',
      txhash: txHash
    });
    return data;
  }

  private async tokenTransfersByWalletBlock(input: {
    txHash: string;
    walletAddress: string;
    tokenAddress?: string | null;
    blockNumber: number;
  }): Promise<EtherscanTokenTransfer[]> {
    const data = await this.fetchAccount<EtherscanTokenTransfer>({
      action: 'tokentx',
      address: input.walletAddress,
      contractaddress: input.tokenAddress ?? undefined,
      startblock: String(input.blockNumber),
      endblock: String(input.blockNumber),
      page: '1',
      offset: '100',
      sort: 'asc'
    });
    return data.filter((row) => row.hash?.toLowerCase() === input.txHash.toLowerCase());
  }

  private async fetchAccount<T>(params: Record<string, string | undefined>): Promise<T[]> {
    const url = new URL(this.baseUrl);
    url.searchParams.set('chainid', '56');
    url.searchParams.set('module', 'account');
    url.searchParams.set('apikey', this.apiKey);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') url.searchParams.set(key, value);
    }
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`etherscan_http_${response.status}`);
    const data = await response.json() as EtherscanResponse<T>;
    if (Array.isArray(data.result)) return data.result;
    const text = String(data.result ?? data.message ?? '');
    if (data.status === '0' && /no transactions found/i.test(`${data.message} ${text}`)) return [];
    if (data.status === '0') throw new Error(text || data.message || 'etherscan_error');
    return [];
  }
}
