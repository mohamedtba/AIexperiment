import { createRouteHandler, jsonOk } from '@/lib/api';
import { requireAdmin } from '@/server/auth/guards';
import { stopCurrentExperiment } from '@/server/services/experimentService';

/**
 * POST /api/admin/experiments/stop — administrator only.
 *
 * Archives the running experiment. Nothing is deleted: every message and every
 * written version stays available in « Expériences précédentes ».
 *
 * Answering 200 with `stopped: null` when nothing was running keeps the button
 * harmless to press twice.
 */
export const POST = createRouteHandler({
  handler: async () => {
    await requireAdmin();
    const stopped = await stopCurrentExperiment();

    return jsonOk({
      stopped: stopped
        ? {
            ...stopped,
            createdAt: stopped.createdAt.toISOString(),
            startedAt: stopped.startedAt.toISOString(),
            archivedAt: stopped.archivedAt?.toISOString() ?? null,
          }
        : null,
    });
  },
});