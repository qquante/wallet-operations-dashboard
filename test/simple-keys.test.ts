import { describe, expect, it } from 'vitest';
import { createTestServices } from './helpers.js';

describe('simple local keys', () => {
  it('generates wallets without unlock and exports plaintext CSV locally', () => {
    const { wallets } = createTestServices();
    const generated = wallets.generate({ count: 2, labelPrefix: 'NOLOCK' });
    expect(generated.created).toBe(2);

    const csv = wallets.exportCsv({});
    expect(csv).toContain('address,label,tags,privateKey');
    expect(csv).toContain(generated.wallets[0].address);
    expect(csv).toContain('0x');
  });
});
