// The solved-table extract, fetched once per page however many figures read it.
// A failed fetch is not kept: the next figure to ask tries again.
import { assetUrl } from './assets';
import { loadTable, type TableData } from './data';

export const TABLE_FILE = 'data/table.json';

let pending: Promise<TableData> | undefined;

export function sharedTable(): Promise<TableData> {
  pending ??= loadTable(assetUrl(TABLE_FILE)).catch((error: unknown) => {
    pending = undefined;
    throw error;
  });
  return pending;
}
