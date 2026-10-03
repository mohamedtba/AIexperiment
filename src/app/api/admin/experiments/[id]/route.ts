import { createRouteHandler, jsonOk } from '@/lib/api';
import { requireAdmin } from '@/server/auth/guards';
import { getExperimentOverview } from '@/server/services/experimentService';

interface Context {
  params: Promise<{ id: string }>;
}

/** GET /api/admin/experiments/[id] — experiment, statistics and participants. */
export const GET = createRouteHandler<never, Context>({
  handler: async (_request, context) => {
    await requireAdmin();
    const { id } = await context.params;
    const { experiment, stats, participants } = await getExperimentOverview(id);

    return jsonOk({
      experiment: {
        ...experiment,
        createdAt: experiment.createdAt.toISOString(),
        startedAt: experiment.startedAt.toISOString(),
        archivedAt: experiment.archivedAt?.toISOString() ?? null,
      },
      stats,
      participants: participants.map((participant) => ({
        ...participant,
        lastActivityAt: participant.lastActivityAt?.toISOString() ?? null,
      })),
    });
  },
});