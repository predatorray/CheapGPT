import type { Json, LocalDocument, TableData } from './task-types';

export async function readAttachment(file: File): Promise<LocalDocument> {
  if (!/\.(txt|md|markdown|csv|json)$/i.test(file.name))
    throw new Error('Attach text, Markdown, CSV, or JSON files. PDFs are not supported yet.');
  if (file.size > 1_000_000) throw new Error('Each attachment must be smaller than 1 MB.');
  const text = await file.text();
  if (text.includes('\0')) throw new Error('This file contains binary data. Attach a text file.');
  return {
    id: crypto.randomUUID(),
    name: file.name,
    text,
    ...(/\.csv$/i.test(file.name) ? { table: parseCsv(text) } : {}),
  };
}

export function parseCsv(text: string): TableData {
  if (text.length > 1_000_000) throw new Error('CSV is too large.');
  const records: string[][] = [];
  let row: string[] = [],
    cell = '',
    quoted = false,
    closed = false,
    touched = false;
  const pushCell = () => {
    row.push(cell);
    cell = '';
    closed = false;
    if (row.length > 50) throw new Error('CSV supports up to 50 columns.');
  };
  const pushRow = () => {
    if (row.length > 1 || touched || row.some((v) => v !== '')) records.push(row);
    row = [];
    touched = false;
    if (records.length > 2001) throw new Error('CSV supports up to 2,000 data rows.');
  };
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
        closed = true;
      } else cell += char;
    } else if (char === ',' || char === '\n' || char === '\r') {
      pushCell();
      if (char !== ',') {
        if (char === '\r' && text[i + 1] === '\n') i++;
        pushRow();
      }
    } else if (char === '"') {
      if (cell || closed) throw new Error('Malformed CSV quoting.');
      quoted = true;
      touched = true;
    } else {
      if (closed) throw new Error('Unexpected text after a CSV quote.');
      cell += char;
      touched = true;
    }
  }
  if (quoted) throw new Error('Close every CSV quote.');
  pushCell();
  pushRow();
  const columns = records.shift()?.map((s) => s.trim());
  if (!columns?.length || columns.some((s) => !s) || new Set(columns).size !== columns.length)
    throw new Error('CSV needs unique, nonempty column headers.');
  if (records.some((r) => r.length !== columns.length))
    throw new Error('CSV rows must match the header width.');
  return { columns, rows: records };
}

export function searchDocuments(documents: LocalDocument[], query: string, ids?: string[]) {
  const words = [...new Set(query.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [])].slice(0, 50);
  const passages: {
    documentId: string;
    name: string;
    index: number;
    text: string;
    score: number;
  }[] = [];
  for (const doc of documents.filter((d) => !ids?.length || ids.includes(d.id))) {
    for (let i = 0; i < doc.text.length; i += 900) {
      const text = doc.text.slice(i, i + 1100);
      const lower = text.toLowerCase();
      passages.push({
        documentId: doc.id,
        name: doc.name,
        index: i,
        text,
        score: words.reduce((n, word) => n + (lower.includes(word) ? 1 : 0), 0),
      });
    }
  }
  return passages.sort((a, b) => b.score - a.score).slice(0, 5);
}

export function tableData(input: unknown): TableData {
  const data = input as TableData;
  if (
    !data ||
    !Array.isArray(data.columns) ||
    !data.columns.length ||
    data.columns.length > 50 ||
    data.columns.some((c) => typeof c !== 'string' || !c || c.length > 100) ||
    new Set(data.columns).size !== data.columns.length ||
    !Array.isArray(data.rows) ||
    data.rows.length > 2000 ||
    data.rows.some(
      (row) =>
        !Array.isArray(row) ||
        row.length !== data.columns.length ||
        row.some((cell) => cell !== null && !['string', 'number', 'boolean'].includes(typeof cell)),
    )
  )
    throw new Error('Provide a table with unique columns and up to 2,000 rows of scalar cells.');
  return structuredClone(data);
}
const numeric = (value: Json): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(value.trim()))
    return Number(value);
  throw new Error(
    'Numeric operations require plain numeric cells; missing values are not guessed.',
  );
};
export function queryTable(input: unknown, args: Record<string, Json>): TableData {
  let { columns, rows } = tableData(input);
  const index = (column: string) => {
    const i = columns.indexOf(column);
    if (i < 0) throw new Error(`Unknown column: ${column}`);
    return i;
  };
  if (args.filter) {
    const f = args.filter as { column: string; op: string; value: Json };
    if (f.value !== null && typeof f.value === 'object')
      throw new Error('Filter values must be scalar cells.');
    const i = index(f.column);
    rows = rows.filter((row) => {
      const cell = row[i];
      if (f.op === 'eq') return String(cell) === String(f.value);
      if (f.op === 'neq') return String(cell) !== String(f.value);
      if (f.op === 'contains')
        return String(cell).toLowerCase().includes(String(f.value).toLowerCase());
      const a = numeric(cell),
        b = numeric(f.value);
      return f.op === 'gt' ? a > b : f.op === 'gte' ? a >= b : f.op === 'lt' ? a < b : a <= b;
    });
  }
  if (args.aggregate) {
    const a = args.aggregate as { operation: string; column?: string; groupBy?: string };
    const groupIndex = a.groupBy ? index(a.groupBy) : -1;
    const valueIndex = a.operation === 'count' ? -1 : index(a.column || '');
    const groups = new Map<string, { label: Json; rows: Json[][] }>();
    if (groupIndex < 0) groups.set('all', { label: 'All rows', rows });
    else
      for (const row of rows) {
        const key = JSON.stringify(row[groupIndex]);
        const group = groups.get(key) || { label: row[groupIndex], rows: [] };
        group.rows.push(row);
        groups.set(key, group);
      }
    rows = [...groups.values()].map((group) => {
      const values = valueIndex >= 0 ? group.rows.map((r) => numeric(r[valueIndex])) : [];
      let result: Json = group.rows.length;
      if (a.operation !== 'count')
        result = !values.length
          ? null
          : a.operation === 'sum'
            ? values.reduce((n, v) => n + v, 0)
            : a.operation === 'avg'
              ? values.reduce((n, v) => n + v, 0) / values.length
              : a.operation === 'min'
                ? Math.min(...values)
                : Math.max(...values);
      if (typeof result === 'number' && !Number.isFinite(result))
        throw new Error('Aggregate result exceeds the numeric range.');
      return groupIndex >= 0 ? [group.label, result] : [result];
    });
    columns = [
      ...(a.groupBy ? [a.groupBy] : []),
      `${a.operation}${a.column ? `(${a.column})` : ''}`,
    ];
  }
  if (args.sort) {
    const sort = args.sort as { column: string; direction: string };
    const i = index(sort.column);
    const isNumeric = rows.every((r) => {
      try {
        numeric(r[i]);
        return true;
      } catch {
        return false;
      }
    });
    rows.sort(
      (a, b) =>
        (sort.direction === 'desc' ? -1 : 1) *
        (isNumeric ? numeric(a[i]) - numeric(b[i]) : String(a[i]).localeCompare(String(b[i]))),
    );
  }
  if (Array.isArray(args.select)) {
    if (!args.select.length || new Set(args.select).size !== args.select.length)
      throw new Error('Select unique, nonempty columns.');
    const selected = args.select as string[],
      indices = selected.map(index);
    rows = rows.map((row) => indices.map((i) => row[i]));
    columns = selected;
  }
  return { columns, rows: rows.slice(0, typeof args.limit === 'number' ? args.limit : 2000) };
}
export function csvText(table: TableData) {
  // Neutralize spreadsheet formulas in exported strings, including leading whitespace/control characters.
  const quote = (cell: Json) => {
    let text = cell === null ? '' : String(cell);
    if (typeof cell === 'string' && /^[\s]*[=+@-]/.test(text)) text = "'" + text;
    return `"${text.replace(/"/g, '""')}"`;
  };
  return [table.columns, ...table.rows].map((row) => row.map(quote).join(',')).join('\r\n');
}
