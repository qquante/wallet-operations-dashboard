import { createHash } from 'node:crypto';
import type { BuneDb } from './db.js';
import type { EventBus } from './events.js';
import type { FourMemeExecutionPlan, FourMemeExecutionPlanInput, FourMemeExecutionPlanner } from './fourMemeExecutionPlanner.js';
import { nowIso } from './time.js';
import type { ExecutionPlanConfirmationRecord, ExecutionPlanRecord } from './types.js';

export const EXECUTION_PLAN_VERSION = 'four_meme_execution_plan_v1';

export interface ExecutionPlanDiff {
  path: string;
  before: unknown;
  after: unknown;
  severity: 'info' | 'warn' | 'error';
}

export interface ExecutionPlanReview {
  id: string;
  savedHash: string;
  liveHash: string;
  changed: boolean;
  reviewedAt: string;
  broadcast: false;
  blockedForBroadcast: true;
  blockReason: 'explicit_real_mode_not_enabled';
  diff: ExecutionPlanDiff[];
  saved: ExecutionPlanRecord;
  livePlan: FourMemeExecutionPlan;
}

export interface ExecutionPlanFinalConfirmation {
  planId: string;
  status: 'draft' | 'rejected' | 'blocked';
  requiredPhrase: string;
  phraseAccepted: boolean;
  realModeEnabled: false;
  broadcast: false;
  blockedForBroadcast: true;
  blockReason: 'real_mode_not_implemented';
  readyForFutureRealMode: boolean;
  checks: Record<string, boolean | string | number | null>;
  blockingReasons: string[];
  confirmation: ExecutionPlanConfirmationRecord | null;
  saved: ExecutionPlanRecord;
}

export class ExecutionPlanStoreService {
  constructor(
    private readonly db: BuneDb,
    private readonly planner: FourMemeExecutionPlanner,
    private readonly events: EventBus
  ) {}

  save(plan: FourMemeExecutionPlan): ExecutionPlanRecord {
    assertDryRunPlan(plan);
    const planRecord = plan as unknown as Record<string, unknown>;
    const request = recordOrThrow(planRecord.request, 'execution_plan_request_missing');
    const planHash = hashExecutionPlan(plan);
    const created = this.db.insertExecutionPlan({
      version: EXECUTION_PLAN_VERSION,
      planHash,
      tokenAddress: plan.tokenAddress,
      side: plan.side,
      request,
      plan: planRecord
    });
    this.events.emitEvent({
      type: 'execution_plan.saved',
      severity: 'info',
      message: `Execution plan saved ${plan.side} ${plan.walletCount} wallets`,
      metadata: {
        id: created.id,
        version: created.version,
        planHash: created.planHash,
        tokenAddress: created.tokenAddress,
        side: created.side,
        walletCount: plan.walletCount,
        blockedForBroadcast: true,
        broadcast: false
      }
    });
    return created;
  }

  list(filters: { tokenAddress?: string; status?: string; limit?: number } = {}): ExecutionPlanRecord[] {
    return this.db.listExecutionPlans(filters);
  }

  byId(id: string): ExecutionPlanRecord {
    const plan = this.db.executionPlanById(id);
    if (!plan) throw new Error('execution_plan_not_found');
    return plan;
  }

  async review(id: string): Promise<ExecutionPlanReview> {
    const saved = this.byId(id);
    if (saved.status === 'archived') throw new Error('execution_plan_archived');
    const request = coerceRequest(saved.request);
    const livePlan = await this.planner.plan(request);
    const liveHash = hashExecutionPlan(livePlan);
    const diff = diffExecutionPlans(saved.plan, livePlan);
    const reviewedAt = nowIso();
    const changed = saved.planHash !== liveHash || diff.length > 0;
    const reviewSummary = {
      id,
      savedHash: saved.planHash,
      liveHash,
      changed,
      reviewedAt,
      broadcast: false,
      blockedForBroadcast: true,
      blockReason: 'explicit_real_mode_not_enabled',
      diff,
      liveSummary: {
        node: livePlan.node,
        walletCount: livePlan.walletCount,
        totals: livePlan.totals,
        statuses: statusCounts(livePlan)
      }
    };
    const updated = this.db.updateExecutionPlanReview(id, reviewSummary);
    this.events.emitEvent({
      type: 'execution_plan.reviewed',
      severity: changed ? 'warn' : 'info',
      message: changed ? `Execution plan changed live ${id}` : `Execution plan unchanged ${id}`,
      metadata: {
        id,
        tokenAddress: saved.tokenAddress,
        side: saved.side,
        savedHash: saved.planHash,
        liveHash,
        changed,
        diffCount: diff.length,
        blockedForBroadcast: true,
        broadcast: false
      }
    });
    return {
      id,
      savedHash: saved.planHash,
      liveHash,
      changed,
      reviewedAt,
      broadcast: false,
      blockedForBroadcast: true,
      blockReason: 'explicit_real_mode_not_enabled',
      diff,
      saved: updated,
      livePlan
    };
  }

  archive(id: string): ExecutionPlanRecord {
    return this.db.archiveExecutionPlan(id);
  }

  finalConfirmationDraft(id: string): ExecutionPlanFinalConfirmation {
    const saved = this.byId(id);
    const { requiredPhrase, checks, blockingReasons, readyForFutureRealMode } = finalConfirmationState(saved, false);
    return {
      planId: saved.id,
      status: 'draft',
      requiredPhrase,
      phraseAccepted: false,
      realModeEnabled: false,
      broadcast: false,
      blockedForBroadcast: true,
      blockReason: 'real_mode_not_implemented',
      readyForFutureRealMode,
      checks,
      blockingReasons,
      confirmation: null,
      saved
    };
  }

  confirmFinal(id: string, input: { confirmationText: string; operatorNote?: string | null }): ExecutionPlanFinalConfirmation {
    const saved = this.byId(id);
    if (saved.status === 'archived') throw new Error('execution_plan_archived');
    const expected = confirmationPhrase(saved);
    const phraseAccepted = input.confirmationText.trim() === expected;
    const { checks, blockingReasons, readyForFutureRealMode } = finalConfirmationState(saved, phraseAccepted);
    const status: ExecutionPlanConfirmationRecord['status'] = phraseAccepted && readyForFutureRealMode ? 'blocked' : 'rejected';
    const confirmation = this.db.insertExecutionPlanConfirmation({
      planId: saved.id,
      status,
      requiredPhrase: expected,
      phraseAccepted,
      operatorNote: input.operatorNote?.trim() || null,
      checks
    });
    this.events.emitEvent({
      type: 'execution_plan.final_confirmation',
      severity: status === 'blocked' ? 'warn' : 'error',
      message: status === 'blocked'
        ? `Execution plan final gate blocked ${id}`
        : `Execution plan final gate rejected ${id}`,
      metadata: {
        id,
        confirmationId: confirmation.id,
        tokenAddress: saved.tokenAddress,
        side: saved.side,
        phraseAccepted,
        readyForFutureRealMode,
        blockingReasons,
        realModeEnabled: false,
        blockedForBroadcast: true,
        broadcast: false
      }
    });
    return {
      planId: saved.id,
      status,
      requiredPhrase: expected,
      phraseAccepted,
      realModeEnabled: false,
      broadcast: false,
      blockedForBroadcast: true,
      blockReason: 'real_mode_not_implemented',
      readyForFutureRealMode,
      checks,
      blockingReasons,
      confirmation,
      saved
    };
  }
}

export function hashExecutionPlan(plan: FourMemeExecutionPlan): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize({ version: EXECUTION_PLAN_VERSION, plan })))
    .digest('hex');
}

export function diffExecutionPlans(saved: Record<string, unknown>, live: FourMemeExecutionPlan): ExecutionPlanDiff[] {
  const liveRecord = live as unknown as Record<string, unknown>;
  const diffs: ExecutionPlanDiff[] = [];
  const add = (path: string, before: unknown, after: unknown, severity: ExecutionPlanDiff['severity']) => {
    if (stableString(before) !== stableString(after)) diffs.push({ path, before, after, severity });
  };

  for (const path of [
    'tokenAddress',
    'side',
    'walletCount',
    'totals.tradeValueWei',
    'totals.gasCostWei',
    'totals.requiredNativeWei',
    'totals.ready',
    'totals.insufficientBnb',
    'totals.simulationErrors',
    'totals.gasUnknown'
  ]) {
    add(path, readPath(saved, path), readPath(liveRecord, path), path.startsWith('totals.') ? 'warn' : 'info');
  }
  add('node', saved.node, live.node, 'info');

  const savedRows = rowsByWallet(saved);
  const liveRows = rowsByWallet(liveRecord);
  add('rows.order', [...savedRows.keys()], [...liveRows.keys()], 'warn');
  const walletIds = [...new Set([...savedRows.keys(), ...liveRows.keys()])];
  for (const walletId of walletIds) {
    const before = savedRows.get(walletId);
    const after = liveRows.get(walletId);
    if (!before || !after) {
      diffs.push({ path: `rows.${walletId}`, before: before ?? null, after: after ?? null, severity: 'error' });
      continue;
    }
    for (const path of [
      'index',
      'status',
      'slippageBps',
      'nonceBase',
      'approvalNonce',
      'tradeNonce',
      'requiredNativeWei',
      'walletBalanceWei',
      'gas.gasPriceWei',
      'gas.totalGasUnits',
      'gas.totalGasCostWei',
      'approval.required',
      'approval.calldata',
      'approval.gasUnits',
      'trade.tx.to',
      'trade.tx.functionName',
      'trade.tx.valueWei',
      'trade.tx.calldata'
    ]) {
      const severity = path.includes('calldata') || path.includes('valueWei') || path === 'status' ? 'warn' : 'info';
      add(`rows.${walletId}.${path}`, readPath(before, path), readPath(after, path), severity);
    }
  }
  return diffs.slice(0, 250);
}

function assertDryRunPlan(plan: FourMemeExecutionPlan): void {
  const record = plan as unknown as Record<string, unknown>;
  if (record.readOnly !== true || record.broadcast !== false || record.blockedForBroadcast !== true) {
    throw new Error('only_blocked_dry_run_execution_plans_can_be_saved');
  }
  if (record.blockReason !== 'explicit_real_mode_not_enabled') throw new Error('execution_plan_block_reason_required');
  if (record.chainId !== 56) throw new Error('execution_plan_chain_56_required');
  if (typeof record.tokenAddress !== 'string' || !record.tokenAddress) throw new Error('execution_plan_token_required');
  if (record.side !== 'buy' && record.side !== 'sell') throw new Error('execution_plan_side_required');
  if (!Array.isArray(record.rows)) throw new Error('execution_plan_rows_required');
}

function coerceRequest(value: Record<string, unknown>): FourMemeExecutionPlanInput {
  if (value.side !== 'buy' && value.side !== 'sell') throw new Error('execution_plan_saved_request_side_invalid');
  if (typeof value.tokenAddress !== 'string' || !value.tokenAddress) throw new Error('execution_plan_saved_request_token_invalid');
  return value as unknown as FourMemeExecutionPlanInput;
}

function recordOrThrow(value: unknown, errorCode: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(errorCode);
  return value as Record<string, unknown>;
}

function rowsByWallet(plan: Record<string, unknown>): Map<string, Record<string, unknown>> {
  const rows = Array.isArray(plan.rows) ? plan.rows : [];
  const result = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const record = row as Record<string, unknown>;
    const walletId = typeof record.walletId === 'string' ? record.walletId : '';
    if (walletId) result.set(walletId, record);
  }
  return result;
}

function readPath(source: Record<string, unknown>, path: string): unknown {
  let current: unknown = source;
  for (const part of path.split('.')) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function statusCounts(plan: FourMemeExecutionPlan): Record<string, number> {
  return plan.rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});
}

function finalConfirmationState(saved: ExecutionPlanRecord, phraseAccepted: boolean): {
  requiredPhrase: string;
  checks: Record<string, boolean | string | number | null>;
  blockingReasons: string[];
  readyForFutureRealMode: boolean;
} {
  const review = saved.latestReview;
  const totals = recordOrNull((saved.plan as Record<string, unknown>).totals);
  const rows = Array.isArray(saved.plan.rows) ? saved.plan.rows : [];
  const reviewed = saved.status === 'reviewed' && typeof review.reviewedAt === 'string';
  const liveHash = typeof review.liveHash === 'string' ? review.liveHash : null;
  const reviewClean = reviewed && review.changed === false && liveHash === saved.planHash;
  const readyRows = Number(totals?.ready ?? 0);
  const walletCount = Number(saved.plan.walletCount ?? rows.length);
  const simulationErrors = Number(totals?.simulationErrors ?? 0);
  const insufficientBnb = Number(totals?.insufficientBnb ?? 0);
  const gasUnknown = Number(totals?.gasUnknown ?? 0);
  const allRowsReady = walletCount > 0 && readyRows === walletCount && simulationErrors === 0 && insufficientBnb === 0 && gasUnknown === 0;
  const checks = {
    phraseAccepted,
    reviewed,
    reviewClean,
    savedHash: saved.planHash,
    liveHash,
    walletCount,
    readyRows,
    allRowsReady,
    simulationErrors,
    insufficientBnb,
    gasUnknown,
    realModeImplemented: false,
    signerEnabled: false,
    broadcastEnabled: false
  };
  const blockingReasons = [
    phraseAccepted ? '' : 'confirmation_phrase_required',
    reviewed ? '' : 'review_live_required',
    reviewClean ? '' : 'saved_plan_differs_from_live_state',
    allRowsReady ? '' : 'rows_not_all_ready',
    'real_mode_not_implemented',
    'signer_disabled',
    'broadcast_disabled'
  ].filter(Boolean);
  const readyForFutureRealMode = phraseAccepted && reviewed && reviewClean && allRowsReady;
  return {
    requiredPhrase: confirmationPhrase(saved),
    checks,
    blockingReasons,
    readyForFutureRealMode
  };
}

function confirmationPhrase(saved: ExecutionPlanRecord): string {
  return `BUNE-CONFIRM-${saved.id}-${saved.planHash.slice(0, 12)}`;
}

function recordOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stableString(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(input).sort()) {
    if (input[key] !== undefined) output[key] = canonicalize(input[key]);
  }
  return output;
}
