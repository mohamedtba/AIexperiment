import { createRouteHandler, jsonOk } from '@/lib/api';
import { requireAdmin } from '@/server/auth/guards';
import { getStudentDetail } from '@/server/services/adminService';

interface Context {
  params: Promise<{ id: string }>;
}

/** GET /api/admin/students/[id] — full activity of a student (admin only). */
export const GET = createRouteHandler<never, Context>({
  handler: async (_request, context) => {
    await requireAdmin();
    const { id } = await context.params;
    const detail = await getStudentDetail(id);

    return jsonOk({
      student: {
        id: detail.student.id,
        username: detail.student.username,
        createdAt: detail.student.createdAt.toISOString(),
        lastLoginAt: detail.student.lastLoginAt?.toISOString() ?? null,
      },
      experiment: detail.experiment
        ? {
            id: detail.experiment.id,
            sequence: detail.experiment.sequence,
            question: detail.experiment.question,
            status: detail.experiment.status,
            startedAt: detail.experiment.startedAt.toISOString(),
          }
        : null,
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