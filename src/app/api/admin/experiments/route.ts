import { createRouteHandler, jsonOk } from '@/lib/api';
import { createExperimentSchema } from '@/lib/validation';
import { requireAdmin } from '@/server/auth/guards';
import {
  getCurrentExperiment,
  listArchivedExperiments,
  startExperiment,
} from '@/server/services/experimentService';

/** GET /api/admin/experiments — active and archived experiments. */
export const GET = createRouteHandler({
  handler: async () => {
    await requireAdmin();
    const [active, archived] = await Promise.all([
      getCurrentExperiment(),
      listArchivedExperiments(),
    ]);
    return jsonOk({
      active: active ? { ...active, createdAt: active.createdAt.toISOString(), startedAt: active.startedAt.toISOString() } : null,
      archived: archived.map((experiment) => ({
        ...experiment,
        createdAt: experiment.createdAt.toISOString(),
        startedAt: experiment.startedAt.toISOString(),
        archivedAt: experiment.archivedAt?.toISOString() ?? null,
      })),
    });
  },
});

/**
 * POST /api/admin/experiments
 * Starts a new experiment: the previous active one is archived (never deleted).
 */
export const POST = createRouteHandler({
  body: createExperimentSchema,
  handler: async (_request, _context, input) => {
    await requireAdmin();
    const experiment = await startExperiment(input.question);
    return jsonOk(
      {
        experiment: {
          ...experiment,
          createdAt: experiment.createdAt.toISOString(),
          startedAt: experiment.startedAt.toISOString(),
        },
      },
      { status: 201 },
    );
  },
});