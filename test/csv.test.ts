import { describe, expect, it } from 'vitest';
import { parseWalletImport } from '../src/server/csv.js';

describe('parseWalletImport', () => {
  it('parses private key lists', () => {
    const rows = parseWalletImport({ text: 'abc\n0xdef', tags: ['batch'] });
    expect(rows).toEqual([
      { privateKey: '0xabc', tags: ['batch'] },
      { privateKey: '0xdef', tags: ['batch'] }
    ]);
  });

  it('parses CSV with labels and tags', () => {
    const rows = parseWalletImport({
      csv: 'privateKey,address,label,tags\n0xabc,,Main,"a;b"'
    });
    expect(rows[0]).toMatchObject({
      privateKey: '0xabc',
      label: 'Main',
      tags: ['a', 'b']
    });
  });
});
