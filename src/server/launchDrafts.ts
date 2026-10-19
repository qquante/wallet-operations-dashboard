import { randomUUID } from 'node:crypto';
import { getAddress } from 'ethers';
import type { BuneDb } from './db.js';
import type { EventBus } from './events.js';
import type { FourMemeLaunchDraft, FourMemeLaunchDraftInput } from './fourMeme.js';
import type { LaunchDraftRecord, WalletRecord } from './types.js';

const FOUR_MEME_FACTORY_ADDRESS = '0x5c952063c7fc8610FFDB798152D69F0B9550762b';
const FOUR_MEME_API_BASE = 'https://four.meme/meme-api/v1';

export interface LaunchDraftCreateInput extends FourMemeLaunchDraftInput {
  campaignName?: string;
  groupIds?: string[];
  devWalletId?: string;
  tokenAddress?: string;
  imageFilePath?: string;
}

export interface FourMemeDraftBuilder {
  launchDraft(input: FourMemeLaunchDraftInput): Promise<FourMemeLaunchDraft>;
}

export interface FourMemeCreateDryRunPlan {
  dryRunOnly: true;
  draftId: string;
  status: string;
  chainId: 56;
  factoryAddress: string;
  apiBase: string;
  endpoints: Record<string, string>;
  devWallet: {
    walletId: string;
    label: string;
    address: string;
    devRank: number | null;
    devRole: string | null;
  } | null;
  auth: Record<string, unknown>;
  imageUpload: Record<string, unknown>;
  createApi: Record<string, unknown>;
  factoryTx: Record<string, unknown>;
  controls: Record<string, unknown>;
  triggers: Array<Record<string, unknown>>;
  note: string;
}

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function unique(values: string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

function metadataMissing(input: {
  name: string;
  shortName: string;
  description: string;
  label: string;
  raisedSymbol: string;
}): string[] {
  return Object.entries(input).filter(([, value]) => !clean(value)).map(([key]) => key);
}

export class LaunchDraftService {
  constructor(
    private readonly db: BuneDb,
    private readonly fourMeme: FourMemeDraftBuilder,
    private readonly events: EventBus
  ) {}

  list(filters: { status?: string; groupId?: string; campaignName?: string; limit?: number } = {}): LaunchDraftRecord[] {
    return this.db.listLaunchDrafts(filters);
  }

  byId(id: string): LaunchDraftRecord {
    const draft = this.db.launchDraftById(id);
    if (!draft) throw new Error('launch_draft_not_found');
    return draft;
  }

  async create(input: LaunchDraftCreateInput): Promise<LaunchDraftRecord> {
    const groupIds = unique(input.groupIds);
    for (const groupId of groupIds) {
      if (!this.db.groupById(groupId)) throw new Error(`group_not_found_${groupId}`);
    }

    const devWallet = input.devWalletId ? this.requireDevWallet(input.devWalletId) : null;
    const tokenAddress = input.tokenAddress ? getAddress(input.tokenAddress) : null;
    const draftPreview = await this.fourMeme.launchDraft(input);
    const controls = this.buildControls({
      groupIds,
      devWallet,
      tokenAddress,
      imageFilePath: input.imageFilePath,
      preview: draftPreview
    });
    const triggers = this.buildTriggers(controls);
    const draft = this.db.insertLaunchDraft({
      id: `ld_${randomUUID()}`,
      campaignName: clean(input.campaignName || draftPreview.token.name) || null,
      groupIds,
      devWalletId: devWallet?.id ?? null,
      tokenAddress,
      name: draftPreview.token.name,
      shortName: draftPreview.token.shortName,
      description: draftPreview.token.desc,
      imgUrl: draftPreview.token.imgUrl,
      imageFilePath: clean(input.imageFilePath) || null,
      label: draftPreview.token.label,
      webUrl: draftPreview.token.webUrl,
      twitterUrl: draftPreview.token.twitterUrl,
      telegramUrl: draftPreview.token.telegramUrl,
      raisedSymbol: draftPreview.options.raisedSymbol,
      raisedTokenAddress: draftPreview.raisedToken.symbolAddress,
      raisedTokenSnapshot: { ...draftPreview.raisedToken },
      preSale: draftPreview.options.preSale,
      onlyMPC: draftPreview.options.onlyMPC,
      feePlan: draftPreview.options.feePlan,
      status: 'draft_saved',
      controls,
      triggers,
      createBodyPreview: draftPreview.createBodyPreview,
      note: draftPreview.note
    });

    if (devWallet) {
      this.db.addWalletHistory({
        walletId: devWallet.id,
        type: 'launch_draft_dev_wallet_selected',
        status: 'dry_run',
        campaignName: draft.campaignName,
        tokenAddress: draft.tokenAddress,
        tokenSymbol: draft.shortName,
        notes: `Launch draft ${draft.shortName}`,
        metadata: { draftId: draft.id, groupIds }
      });
      this.db.addTagsToWallets([devWallet.id], [`dev:${draft.shortName}`, `draft:${draft.shortName}`]);
    }

    this.events.emitEvent({
      type: 'launch_draft.saved',
      severity: 'info',
      message: `Launch draft salvo: ${draft.name} (${draft.shortName})`,
      metadata: { draftId: draft.id, groupIds, devWalletId: devWallet?.id ?? null, dryRunOnly: true }
    });
    return draft;
  }

  prepareCreateDryRun(id: string): FourMemeCreateDryRunPlan {
    const draft = this.byId(id);
    const devWallet = draft.devWalletId ? this.requireDevWallet(draft.devWalletId) : null;
    const controls = this.buildControls({
      groupIds: draft.groupIds,
      devWallet,
      tokenAddress: draft.tokenAddress,
      imageFilePath: draft.imageFilePath,
      preview: this.previewFromRecord(draft)
    });
    const triggers = this.buildTriggers(controls);
    const plan: FourMemeCreateDryRunPlan = {
      dryRunOnly: true,
      draftId: draft.id,
      status: 'create_dry_run_prepared',
      chainId: 56,
      factoryAddress: FOUR_MEME_FACTORY_ADDRESS,
      apiBase: FOUR_MEME_API_BASE,
      endpoints: {
        nonce: '/private/user/nonce/generate',
        login: '/private/user/login/dex',
        upload: '/private/token/upload',
        create: '/private/token/create',
        factory: FOUR_MEME_FACTORY_ADDRESS
      },
      devWallet: devWallet ? {
        walletId: devWallet.id,
        label: devWallet.label,
        address: devWallet.address,
        devRank: devWallet.devRank,
        devRole: devWallet.devRole
      } : null,
      auth: {
        willCall: false,
        required: true,
        blocked: !devWallet,
        reason: devWallet ? 'manual_or_future_auth_step' : 'dev_wallet_required',
        noncePayloadPreview: devWallet ? { accountAddress: devWallet.address, networkCode: 'BSC', verifyType: 'LOGIN' } : null,
        signMessageTemplate: 'You are sign in Meme <nonce>',
        loginPayloadPreview: devWallet ? {
          inviteCode: '',
          langType: 'EN',
          loginIp: '',
          region: 'WEB',
          verifyInfo: { address: devWallet.address, networkCode: 'BSC', signature: '<wallet_signature>', verifyType: 'LOGIN' },
          walletName: 'MetaMask'
        } : null
      },
      imageUpload: {
        willCall: false,
        required: !draft.imgUrl,
        source: draft.imgUrl ? 'existing_img_url' : draft.imageFilePath ? 'local_file_path' : 'missing',
        imgUrl: draft.imgUrl || null,
        imageFilePath: draft.imageFilePath,
        blocked: !draft.imgUrl && !draft.imageFilePath,
        reason: draft.imgUrl ? 'image_already_has_url' : draft.imageFilePath ? 'upload_pending_future_auth' : 'image_required_before_real_create'
      },
      createApi: {
        willCall: false,
        requiresAccessToken: true,
        blocked: !devWallet || (!draft.imgUrl && !draft.imageFilePath),
        payloadPreview: draft.createBodyPreview
      },
      factoryTx: {
        willBroadcast: false,
        blocked: true,
        reason: 'broadcast_disabled_in_v1',
        requiresCreateApiData: ['createArg', 'signature', 'tokenId'],
        valueWeiPreview: '0'
      },
      controls,
      triggers,
      note: 'dry_run_only_no_login_no_upload_no_signature_no_broadcast'
    };
    this.db.updateLaunchDraftPlan(id, {
      status: plan.status,
      controls,
      triggers,
      createDryRunPlan: plan as unknown as Record<string, unknown>,
      note: plan.note
    });
    this.events.emitEvent({
      type: 'launch_draft.create_dry_run_prepared',
      severity: 'info',
      message: `Create dry-run preparado: ${draft.shortName}`,
      metadata: { draftId: draft.id, dryRunOnly: true, broadcastBlocked: true }
    });
    return plan;
  }

  archive(id: string): LaunchDraftRecord {
    const draft = this.db.updateLaunchDraftPlan(id, { status: 'archived' });
    this.events.emitEvent({
      type: 'launch_draft.archived',
      severity: 'info',
      message: `Launch draft arquivado: ${draft.shortName}`,
      metadata: { draftId: draft.id }
    });
    return draft;
  }

  private requireDevWallet(walletId: string): WalletRecord {
    const wallet = this.db.walletById(walletId);
    if (!wallet) throw new Error('dev_wallet_not_found');
    if (wallet.devRank === null) throw new Error('dev_wallet_not_configured');
    return wallet;
  }

  private previewFromRecord(draft: LaunchDraftRecord): FourMemeLaunchDraft {
    return {
      dryRunOnly: true,
      readyForApiPrepare: false,
      token: {
        name: draft.name,
        shortName: draft.shortName,
        desc: draft.description,
        imgUrl: draft.imgUrl,
        label: draft.label,
        webUrl: draft.webUrl,
        twitterUrl: draft.twitterUrl,
        telegramUrl: draft.telegramUrl,
        launchTime: Number(draft.createBodyPreview.launchTime ?? Date.now())
      },
      options: {
        raisedSymbol: draft.raisedSymbol,
        preSale: draft.preSale,
        onlyMPC: draft.onlyMPC,
        feePlan: draft.feePlan
      },
      raisedToken: draft.raisedTokenSnapshot as unknown as FourMemeLaunchDraft['raisedToken'],
      createBodyPreview: draft.createBodyPreview,
      note: draft.note ?? ''
    };
  }

  private buildControls(input: {
    groupIds: string[];
    devWallet: WalletRecord | null;
    tokenAddress: string | null;
    imageFilePath?: string | null;
    preview: FourMemeLaunchDraft;
  }): Record<string, unknown> {
    const missing = metadataMissing({
      name: input.preview.token.name,
      shortName: input.preview.token.shortName,
      description: input.preview.token.desc,
      label: input.preview.token.label,
      raisedSymbol: input.preview.options.raisedSymbol
    });
    const hasImageSource = Boolean(input.preview.token.imgUrl || clean(input.imageFilePath));
    return {
      metadataComplete: missing.length === 0,
      metadataMissing: missing,
      groupsSelected: input.groupIds.length > 0,
      groupCount: input.groupIds.length,
      devWalletConfigured: Boolean(input.devWallet),
      devWalletRank: input.devWallet?.devRank ?? null,
      raisedTokenSynced: Boolean(input.preview.raisedToken?.symbolAddress),
      imageReadyForCreate: hasImageSource,
      tokenAddressKnown: Boolean(input.tokenAddress),
      canPrepareCreateApi: missing.length === 0 && Boolean(input.devWallet) && hasImageSource,
      canGenerateFirstBuyQueue: Boolean(input.tokenAddress),
      canBroadcast: false,
      broadcastBlockReason: 'broadcast_disabled_in_v1'
    };
  }

  private buildTriggers(controls: Record<string, unknown>): Array<Record<string, unknown>> {
    return [
      { id: 'metadata_saved', status: controls.metadataComplete ? 'ready' : 'blocked', kind: 'local' },
      { id: 'group_association', status: controls.groupsSelected ? 'ready' : 'optional', kind: 'local' },
      { id: 'dev_wallet_auth', status: controls.devWalletConfigured ? 'ready' : 'blocked', kind: 'future_auth' },
      { id: 'image_upload', status: controls.imageReadyForCreate ? 'ready' : 'blocked', kind: 'future_upload' },
      { id: 'four_meme_create_api', status: controls.canPrepareCreateApi ? 'ready' : 'blocked', kind: 'future_api' },
      { id: 'factory_tx', status: 'blocked', kind: 'broadcast', reason: controls.broadcastBlockReason }
    ];
  }
}
