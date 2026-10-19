export interface ImportRow {
  privateKey: string;
  address?: string;
  label?: string;
  tags: string[];
}

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && line[i + 1] === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

function normalizePrivateKey(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
}

export function parseWalletImport(input: { text?: string; csv?: string; tags?: string[] }): ImportRow[] {
  const raw = input.csv ?? input.text ?? '';
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return [];

  const first = splitCsvLine(lines[0]).map((value) => value.toLowerCase());
  const hasHeader = first.includes('privatekey') || first.includes('private_key') || first.includes('address');
  const rows: ImportRow[] = [];

  if (hasHeader) {
    const header = first;
    const pkIndex = header.findIndex((value) => value === 'privatekey' || value === 'private_key');
    const addressIndex = header.indexOf('address');
    const labelIndex = header.indexOf('label');
    const tagIndex = header.findIndex((value) => value === 'tag' || value === 'tags');
    if (pkIndex < 0) throw new Error('csv_private_key_required');
    for (const line of lines.slice(1)) {
      const values = splitCsvLine(line);
      const privateKey = values[pkIndex]?.trim();
      if (!privateKey) continue;
      const tagText = tagIndex >= 0 ? values[tagIndex] ?? '' : '';
      rows.push({
        privateKey: normalizePrivateKey(privateKey),
        address: addressIndex >= 0 ? values[addressIndex] : undefined,
        label: labelIndex >= 0 ? values[labelIndex] : undefined,
        tags: [...(input.tags ?? []), ...tagText.split(/[;|]/).map((tag) => tag.trim()).filter(Boolean)]
      });
    }
    return rows;
  }

  for (const line of lines) {
    const privateKey = splitCsvLine(line)[0];
    if (privateKey) {
      rows.push({
        privateKey: normalizePrivateKey(privateKey),
        tags: input.tags ?? []
      });
    }
  }
  return rows;
}

export function toPrivateKeyCsv(rows: Array<{ address: string; label: string; tags: string[]; privateKey: string }>): string {
  const escape = (value: string) => `"${value.replaceAll('"', '""')}"`;
  return [
    'address,label,tags,privateKey',
    ...rows.map((row) => [
      row.address,
      escape(row.label),
      escape(row.tags.join(';')),
      row.privateKey
    ].join(','))
  ].join('\n');
}
