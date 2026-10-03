import { createRouteHandler, jsonOk } from '@/lib/api';
import { requireAdmin } from '@/server/auth/guards';
import { getExperimentParticipantDetail } from '@/server/services/experimentService';

interface Context {
  params: Promise<{ id: string; studentId: string }>;
}

/**
 * GET /api/admin/experiments/[id]/participants/[studentId]
 * Complete conversation IA + all writing versions for one student in one
 * experiment (active or archived).
 */
export const GET = createRouteHandler<never, Context>({
  handler: async (_request, context) => {
    await requireAdmin();
    const { id, studentId } = await context.params;
    const detail = await getExperimentParticipantDetail(id, studentId);

    return jsonOk({
      student: {
        id: detail.studentId,
        username: detail.username,
        createdAt: detail.createdAt.toISOString(),
      },
      messages: detail.messages.map((message) => ({
        ...message,
        createdAt: message.createdAt.toISOString(),
      })),
      versions: detail.versions.map((version) => ({
        ...version,
        createdAt: version.createdAt.toISOString(),
      })),
    });
  },
});