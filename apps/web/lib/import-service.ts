/** Prepare one canonical transaction request for both upload and extension imports. */
import { createHash } from 'node:crypto';
import {
  normalizedContent,
  validateImport,
} from '../../../packages/shared/src/import';
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
const hash = (value: unknown) =>
  createHash('sha256').update(stable(value)).digest('hex');
export function prepareImport(input: unknown, idempotencyKey: string) {
  const { data, recencyKey } = validateImport(input);
  if (idempotencyKey !== data.extractionId)
    throw new Error('idempotency-key-mismatch');
  return {
    p_payload: data,
    p_key: recencyKey,
    p_content_hash: hash(normalizedContent(data)),
    p_request_hash: hash(data),
  };
}
