import { createRouteHandler, jsonOk } from '@/lib/api';
import { requireStudent } from '@/server/auth/guards';
import { getCurrentExperiment } from '@/server/services/experimentService';

/**
 * GET /api/student/experiment
 * Only the ACTIVE experiment is exposed to students: archived experiments are
 * invisible from the student side.
 */
export const GET = createRouteHandler({
  handler: async () => {
    await requireStudent();
    const experiment = await getCurrentExperiment();
    return jsonOk({
      experiment: experiment
        ? {
            id: experiment.id,
            sequence: experiment.sequence,
            question: experiment.question,
            startedAt: experiment.startedAt.toISOString(),
          }
        : null,
    });
  },
});