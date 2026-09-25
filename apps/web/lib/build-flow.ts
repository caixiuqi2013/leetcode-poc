/** Recover a pending build across navigation/login; persist only validated payloads. */
import { z } from 'zod';
import { validateImport } from '../../../packages/shared/src/import';
import {
  ExportSchema,
  type Extraction,
} from '../../../packages/shared/src/schema';
export const payloadKey = 'leetbycompany.pending.v1';
export const capabilityKey = 'leetbycompany.build.v1';
export const Capability = z
  .object({
    importId: z.string().uuid(),
    extensionId: z.string().regex(/^[a-p]{32}$/),
  })
  .strict();
export type CapabilityValue = z.infer<typeof Capability>;
const ResponseSchema = z.union([
  z.object({ error: z.string() }),
  z.object({
    status: z.literal('building'),
    count: z.number().int().nonnegative(),
    total: z.number().int().nonnegative().nullable(),
    company: z.string(),
    recency: z.string().nullable(),
  }),
  z.object({ status: z.literal('ready'), extraction: ExportSchema }),
]);
export type BuildProgress = {
  phase: 'reading' | 'saving' | 'opening';
  count: number;
  total: number | null;
  company?: string;
  recency?: string | null;
};
/** New link capabilities always take priority over an older browser-staged payload. */
export function resumeBuild(
  hash: string,
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>,
) {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  if (params.has('importId') || params.has('extensionId')) {
    const capability = Capability.parse({
      importId: params.get('importId'),
      extensionId: params.get('extensionId'),
    });
    storage.setItem(capabilityKey, JSON.stringify(capability));
    storage.removeItem(payloadKey);
    return { capability, data: null };
  }
  const storedCapability = storage.getItem(capabilityKey);
  if (storedCapability)
    return {
      capability: Capability.parse(JSON.parse(storedCapability)),
      data: null,
    };
  const payload = storage.getItem(payloadKey);
  return {
    capability: null,
    data: payload ? validateImport(JSON.parse(payload)).data : null,
  };
}
export async function receiveBuild(
  capability: CapabilityValue,
  read: (c: CapabilityValue) => Promise<unknown>,
  signal: AbortSignal,
  progress: (p: BuildProgress) => void,
  pause = () => new Promise<void>((r) => setTimeout(r, 1000)),
): Promise<Extraction> {
  while (true) {
    signal.throwIfAborted();
    const response = ResponseSchema.parse(await read(capability));
    signal.throwIfAborted();
    if ('error' in response) throw new Error(response.error);
    if (response.status === 'ready')
      return validateImport(response.extraction).data;
    progress({
      phase: 'reading',
      count: response.count,
      total: response.total,
      company: response.company,
      recency: response.recency,
    });
    await pause();
  }
}
export function buildError(code: string) {
  const messages: Record<string, string> = {
    'configuration-required':
      'Saving lists is not available yet. The site owner needs to finish account and database setup. Your list is retained so you can try again afterward.',
    'authentication-required':
      'Your list is ready. Sign in with your invited Google account and we will finish building it automatically.',
    'invitation-required':
      'This account needs an invitation to save and practice lists.',
    'access-denied': 'This account is not allowed to save this list.',
    'build-cancelled':
      'The build was cancelled or the LeetCode page changed. Return to the company page and build the list again.',
    'build-interrupted':
      'We lost contact with the LeetCode page. Return to it and build the list again.',
    'build-failed':
      'We could not finish reading the list. Check the extension on your LeetCode page and try again.',
    'build-incomplete':
      'Some problems could not be read. Return to LeetCode and build the complete list again.',
    'build-replaced':
      'A newer build replaced this one. Use the most recently opened practice tab.',
    'pending-import-expired':
      'This build has expired. Start a new build from the extension.',
    'bridge-unavailable':
      'Could not reach the extension. Use Chrome with LeetByCompany enabled, then try again.',
    'handoff-rejected':
      'This page could not access that build. Start again from the extension.',
    'database-unavailable':
      'Saving is temporarily unavailable. Your list is retained. Please try again.',
  };
  return (
    messages[code] ??
    'We could not finish building your list. Your pending list is retained. Please try again.'
  );
}
