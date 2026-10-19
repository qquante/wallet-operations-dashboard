import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach } from 'vitest';
import { BuneDb } from '../src/server/db.js';
import { EventBus } from '../src/server/events.js';
import { GroupService } from '../src/server/groupService.js';
import { WalletService } from '../src/server/walletService.js';

const cleanup: string[] = [];
const dbCleanup: BuneDb[] = [];

afterEach(() => {
  while (dbCleanup.length) {
    dbCleanup.pop()!.close();
  }
  while (cleanup.length) {
    rmSync(cleanup.pop()!, { recursive: true, force: true });
  }
});

export function createTestServices() {
  const dir = mkdtempSync(path.join(tmpdir(), 'bune-test-'));
  cleanup.push(dir);
  const db = new BuneDb(path.join(dir, 'test.sqlite'));
  dbCleanup.push(db);
  const events = new EventBus(db);
  const wallets = new WalletService(db, events);
  const groups = new GroupService(db, events);
  return { db, events, wallets, groups };
}
