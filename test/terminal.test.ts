import { describe, expect, it } from 'vitest';
import { TerminalService } from '../src/server/terminal.js';
import { createTestServices } from './helpers.js';

describe('terminal foundation', () => {
  it('persists campaign/token/task dry-run/automation/blueprint/settings without broadcast', () => {
    const { db, events, wallets, groups } = createTestServices();
    const [dev] = wallets.generate({ count: 1, labelPrefix: 'DEV' }).wallets;
    const [buyer] = wallets.generate({ count: 2, labelPrefix: 'BUY', tags: ['wave1'] }).wallets;
    wallets.setDevConfig({ walletId: dev.id, devRank: 1, devRole: 'creator' });
    wallets.setPrimeRank(buyer.id, 1);
    const group = groups.create({ name: 'Wave 1', campaignName: 'Campaign X' });
    groups.pullWallets({ groupId: group.id, count: 2, tags: ['wave1'], preview: false });

    const terminal = new TerminalService(db, events);
    const campaign = terminal.createCampaign({
      name: 'Campaign X',
      groupIds: [group.id],
      devWalletIds: [dev.id],
      tags: ['fourmeme']
    });
    const token = terminal.createToken({
      name: 'Token X',
      symbol: 'TKX',
      campaignId: campaign.id,
      groupId: group.id,
      devWalletId: dev.id,
      status: 'pre_launch',
      metadata: { website: 'https://example.com' }
    });
    const task = terminal.createTask({
      tokenId: token.id,
      name: 'First buy wave',
      kind: 'first_buy',
      groupId: group.id,
      params: { amountMode: 'random_range', minAmountBnb: '0.005', maxAmountBnb: '0.02' }
    });

    const planned = terminal.prepareTaskDryRun(task.id);
    expect(planned.status).toBe('dry_run_ready');
    expect(planned.dryRunPlan).toMatchObject({
      dryRunOnly: true,
      broadcastBlocked: true,
      checks: {
        canBroadcast: false,
        broadcastBlockReason: 'broadcast_disabled_in_v1',
        walletCount: 2
      }
    });
    expect((planned.dryRunPlan.queue as Array<{ walletLabel: string }>).map((row) => row.walletLabel)).toContain(buyer.label);

    const automation = terminal.createAutomation({
      tokenId: token.id,
      name: 'Profit sell prime',
      triggerType: 'profit',
      triggerValue: '35%',
      taskIds: [task.id]
    });
    const blueprint = terminal.createBlueprint({
      name: 'Four.meme standard',
      walletSlots: [{ slot: 'PRIME', count: 5 }],
      taskTemplates: [{ kind: 'first_buy' }],
      settings: { broadcast: 'disabled' }
    });
    const setting = terminal.setSetting('default_slippage_buy_pct', '5');

    expect(terminal.listCampaigns()).toHaveLength(1);
    expect(terminal.listTokens()).toHaveLength(1);
    expect(terminal.listTasks()).toHaveLength(1);
    expect(terminal.listAutomations()[0].id).toBe(automation.id);
    expect(terminal.listBlueprints()[0].id).toBe(blueprint.id);
    expect(terminal.listSettings()).toContainEqual(setting);
  });
});
