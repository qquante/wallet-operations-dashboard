import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? files(full) : [full];
  });
}

describe('broadcast safety', () => {
  it('does not include raw transaction broadcast calls in V1 server code', () => {
    const serverFiles = files(path.join(process.cwd(), 'src', 'server')).filter((file) => file.endsWith('.ts'));
    const source = serverFiles.map((file) => readFileSync(file, 'utf8')).join('\n');
    expect(source).not.toContain('sendRawTransaction');
    expect(source).not.toContain('sendTransaction(');
    expect(source).not.toContain('broadcastTransaction');
  });
});
