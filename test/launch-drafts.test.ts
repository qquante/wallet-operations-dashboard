import { describe, expect, it } from 'vitest';
import { LaunchDraftService } from '../src/server/launchDrafts.js';
import type { FourMemeDraftBuilder } from '../src/server/launchDrafts.js';
import { createTestServices } from './helpers.js';

const fakeFourMeme: FourMemeDraftBuilder = {
  async launchDraft(input) {
    return {
      dryRunOnly: true,
      readyForApiPrepare: false,
      token: {
        name: input.name,
        shortName: input.shortName.toUpperCase(),
        desc: input.desc,
        imgUrl: input.imgUrl ?? '',
        label: input.label ?? 'Meme',
        webUrl: input.webUrl ?? '',
        twitterUrl: input.twitterUrl ?? '',
        telegramUrl: input.telegramUrl ?? '',
        launchTime: 123
      },
      options: {
        raisedSymbol: input.raisedSymbol ?? 'BNB',
        preSale: input.preSale ?? '0',
        onlyMPC: Boolean(input.onlyMPC),
        feePlan: input.feePlan ?? true
      },
      raisedToken: {
        symbol: input.raisedSymbol ?? 'BNB',
        nativeSymbol: 'BNB',
        symbolAddress: '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c',
        totalBAmount: '18',
        b0Amount: '8',
        totalAmount: '1000000000',
        saleRate: '0.8',
        reservedNumber: 10,
        buyFee: '0.01',
        sellFee: '0.01',
        minTradeFee: '0',
        status: 'PUBLISH',
        networkCode: 'BSC',
        platform: 'MEME'
      },
      createBodyPreview: {
        name: input.name,
        shortName: input.shortName.toUpperCase(),
        desc: input.desc,
        raisedToken: input.raisedSymbol ?? 'BNB',
        launchTime: 123
      },
      note: 'draft_only_no_login_no_upload_no_signature_no_broadcast'
    };
  }
};

describe('launch drafts', () => {
  it('saves a Four.meme draft with group/dev associations and prepares create dry-run controls', async () => {
    const { db, events, wallets, groups } = createTestServices();
    const [wallet] = wallets.generate({ count: 1, labelPrefix: 'DEV' }).wallets;
    db.setWalletDevConfig(wallet.id, { devRank: 1, devRole: 'creator' });
    const group = groups.create({ name: 'Launch Group', campaignName: 'Campaign X' });

    const drafts = new LaunchDraftService(db, fakeFourMeme, events);
    const draft = await drafts.create({
      campaignName: 'Campaign X',
      groupIds: [group.id],
      devWalletId: wallet.id,
      name: 'Token X',
      shortName: 'tkx',
      desc: 'Token X description',
      imgUrl: 'https://cdn.example/token.png',
      label: 'Meme',
      raisedSymbol: 'BNB',
      preSale: '0',
      feePlan: true
    });

    expect(draft.status).toBe('draft_saved');
    expect(draft.groupIds).toEqual([group.id]);
    expect(draft.devWalletId).toBe(wallet.id);
    expect(draft.devWalletLabel).toBe(wallet.label);
    expect(draft.shortName).toBe('TKX');
    expect(draft.controls).toMatchObject({
      canPrepareCreateApi: true,
      canBroadcast: false,
      broadcastBlockReason: 'broadcast_disabled_in_v1'
    });
    expect(db.listWalletHistory({ walletId: wallet.id }).some((row) => row.type === 'launch_draft_dev_wallet_selected')).toBe(true);

    const plan = drafts.prepareCreateDryRun(draft.id);
    expect(plan).toMatchObject({
      dryRunOnly: true,
      status: 'create_dry_run_prepared',
      chainId: 56,
      devWallet: { walletId: wallet.id },
      factoryTx: { willBroadcast: false, blocked: true, reason: 'broadcast_disabled_in_v1' }
    });
    expect(plan.endpoints.create).toBe('/private/token/create');
    expect(db.launchDraftById(draft.id)?.status).toBe('create_dry_run_prepared');
    expect(drafts.list()).toHaveLength(1);
  });
});
