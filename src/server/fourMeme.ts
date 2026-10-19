import { getAddress } from 'ethers';
import type { EventBus } from './events.js';
import { nowIso } from './time.js';

const FOUR_MEME_BASE = 'https://four.meme/meme-api/v1';

export interface FourMemeRaisedToken {
  symbol: string;
  nativeSymbol: string;
  symbolAddress: string;
  totalBAmount: string;
  b0Amount: string;
  totalAmount: string;
  saleRate: string;
  reservedNumber: number;
  buyFee: string;
  sellFee: string;
  minTradeFee: string;
  status: string;
  networkCode: string;
  platform: string;
}

export interface FourMemeConfigSnapshot {
  updatedAt: string;
  published: FourMemeRaisedToken[];
  all: FourMemeRaisedToken[];
}

export interface FourMemeSearchInput {
  type?: string;
  listType?: string;
  status?: string;
  sort?: string;
  symbol?: string;
  version?: string;
  keyword?: string;
  pageIndex?: number;
  pageSize?: number;
}

export interface FourMemeLaunchDraftInput {
  name: string;
  shortName: string;
  desc: string;
  imgUrl?: string;
  label?: string;
  webUrl?: string;
  twitterUrl?: string;
  telegramUrl?: string;
  raisedSymbol?: string;
  preSale?: string;
  onlyMPC?: boolean;
  feePlan?: boolean;
  launchTime?: number;
}

export interface FourMemeLaunchDraft {
  dryRunOnly: true;
  readyForApiPrepare: false;
  token: {
    name: string;
    shortName: string;
    desc: string;
    imgUrl: string;
    label: string;
    webUrl: string;
    twitterUrl: string;
    telegramUrl: string;
    launchTime: number;
  };
  options: {
    raisedSymbol: string;
    preSale: string;
    onlyMPC: boolean;
    feePlan: boolean;
  };
  raisedToken: FourMemeRaisedToken;
  createBodyPreview: Record<string, unknown>;
  note: string;
}

function ensureObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

export class FourMemeService {
  constructor(private readonly events: EventBus) {}

  async config(): Promise<FourMemeConfigSnapshot> {
    const response = await fetch(`${FOUR_MEME_BASE}/public/config`, { headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`four_meme_config_http_${response.status}`);
    const payload = ensureObject(await response.json());
    if (Number(payload.code) !== 0) throw new Error(String(payload.msg || 'four_meme_config_failed'));
    const all = (Array.isArray(payload.data) ? payload.data : []).map((item) => ensureObject(item)).map((item) => ({
      symbol: String(item.symbol ?? ''),
      nativeSymbol: String(item.nativeSymbol ?? ''),
      symbolAddress: String(item.symbolAddress ?? ''),
      totalBAmount: String(item.totalBAmount ?? '0'),
      b0Amount: String(item.b0Amount ?? '0'),
      totalAmount: String(item.totalAmount ?? '0'),
      saleRate: String(item.saleRate ?? '0'),
      reservedNumber: Number(item.reservedNumber ?? 0),
      buyFee: String(item.buyFee ?? '0'),
      sellFee: String(item.sellFee ?? '0'),
      minTradeFee: String(item.minTradeFee ?? '0'),
      status: String(item.status ?? ''),
      networkCode: String(item.networkCode ?? ''),
      platform: String(item.platform ?? '')
    }));
    const snapshot = {
      updatedAt: nowIso(),
      published: all.filter((item) => item.status === 'PUBLISH' && item.networkCode === 'BSC'),
      all
    };
    this.events.emitEvent({
      type: 'four_meme.config_synced',
      severity: 'info',
      message: `Four.meme config sync: ${snapshot.published.length} raised tokens publicados`,
      metadata: { published: snapshot.published.map((item) => item.symbol) }
    });
    return snapshot;
  }

  async tokenDetail(address: string): Promise<Record<string, unknown>> {
    const tokenAddress = getAddress(address);
    const response = await fetch(`${FOUR_MEME_BASE}/private/token/get/v2?address=${tokenAddress}`, {
      headers: { accept: 'application/json' }
    });
    if (!response.ok) throw new Error(`four_meme_token_http_${response.status}`);
    const payload = ensureObject(await response.json());
    if (Number(payload.code) !== 0) throw new Error(String(payload.msg || 'four_meme_token_failed'));
    return ensureObject(payload.data);
  }

  async search(input: FourMemeSearchInput): Promise<Record<string, unknown>[]> {
    const body = {
      type: input.type || 'NEW',
      listType: input.listType || 'NOR',
      pageIndex: input.pageIndex ?? 1,
      pageSize: Math.min(Math.max(input.pageSize ?? 20, 1), 100),
      status: input.status || 'PUBLISH',
      sort: input.sort || 'DESC',
      symbol: input.symbol || undefined,
      version: input.version || undefined,
      keyword: input.keyword || undefined
    };
    const response = await fetch(`${FOUR_MEME_BASE}/public/token/search`, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error(`four_meme_search_http_${response.status}`);
    const payload = ensureObject(await response.json());
    if (Number(payload.code) !== 0) throw new Error(String(payload.msg || 'four_meme_search_failed'));
    return (Array.isArray(payload.data) ? payload.data : []).map((item) => ensureObject(item));
  }

  async launchDraft(input: FourMemeLaunchDraftInput): Promise<FourMemeLaunchDraft> {
    const name = clean(input.name);
    const shortName = clean(input.shortName).toUpperCase();
    const desc = clean(input.desc);
    if (!name) throw new Error('four_meme_draft_name_required');
    if (!shortName) throw new Error('four_meme_draft_symbol_required');
    if (!desc) throw new Error('four_meme_draft_description_required');
    if (shortName.length > 16) throw new Error('four_meme_draft_symbol_too_long');

    const config = await this.config();
    const requestedRaised = clean(input.raisedSymbol || 'BNB').toUpperCase();
    const raisedToken = config.published.find((token) => token.symbol.toUpperCase() === requestedRaised);
    if (!raisedToken) throw new Error(`four_meme_raised_token_unavailable_${requestedRaised || 'UNKNOWN'}`);

    const token = {
      name,
      shortName,
      desc,
      imgUrl: clean(input.imgUrl),
      label: clean(input.label || 'Meme'),
      webUrl: clean(input.webUrl),
      twitterUrl: clean(input.twitterUrl),
      telegramUrl: clean(input.telegramUrl),
      launchTime: input.launchTime && input.launchTime > 0 ? input.launchTime : Date.now()
    };
    const options = {
      raisedSymbol: raisedToken.symbol,
      preSale: clean(input.preSale || '0'),
      onlyMPC: Boolean(input.onlyMPC),
      feePlan: input.feePlan ?? true
    };
    const createBodyPreview = {
      ...token,
      ...options,
      raisedToken: raisedToken.symbol,
      raisedTokenAddress: raisedToken.symbolAddress,
      networkCode: raisedToken.networkCode,
      platform: raisedToken.platform,
      totalBAmount: raisedToken.totalBAmount,
      b0Amount: raisedToken.b0Amount,
      saleRate: raisedToken.saleRate,
      buyFee: raisedToken.buyFee,
      sellFee: raisedToken.sellFee
    };
    const draft: FourMemeLaunchDraft = {
      dryRunOnly: true,
      readyForApiPrepare: false,
      token,
      options,
      raisedToken,
      createBodyPreview,
      note: 'draft_only_no_login_no_upload_no_signature_no_broadcast'
    };
    this.events.emitEvent({
      type: 'four_meme.launch_draft_prepared',
      severity: 'info',
      message: `Four.meme draft preparado: ${token.name} (${token.shortName}) raise ${raisedToken.symbol}`,
      metadata: { symbol: token.shortName, raisedSymbol: raisedToken.symbol, dryRunOnly: true }
    });
    return draft;
  }
}
