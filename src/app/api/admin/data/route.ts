import { createRouteHandler, jsonOk } from '@/lib/api';
import { wipeDataSchema, type WipeDataInput } from '@/lib/validation';
import { requireAdmin } from '@/server/auth/guards';
import { getDataCounts, wipeCollectedData } from '@/server/services/dataService';

/**
 * GET /api/admin/data — how much data is currently stored.
 *
 * Read-only: the interface shows these figures before asking for a deletion, so
 * the teacher confirms a real number and never a guess.
 */
export const GET = createRouteHandler({
  handler: async () => {
    await requireAdmin();
    return jsonOk({ counts: await getDataCounts() });
  },
});

/**
 * POST /api/admin/data/wipe — permanent deletion of the collected material.
 *
 * The accounts always survive, by design: wiping the data must not cost the
 * teacher the login credentials of the class. The experiments are only deleted
 * when the request says so, because they carry the questions rather than the
 * students' words.
 *
 * The confirmation word is validated by the schema, so a misclick that forgets
 * it is rejected before anything is deleted.
 */
export const POST = createRouteHandler<WipeDataInput>({
  body: wipeDataSchema,
  handler: async (_request, _context, input) => {
    await requireAdmin();
    const result = await wipeCollectedData(input.experiments);
    return jsonOk({ deleted: result });
  },
});