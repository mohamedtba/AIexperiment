import { createRouteHandler, jsonOk } from '@/lib/api';
import { requireStudent } from '@/server/auth/guards';
import { getStudentWorkspace } from '@/server/services/studentExperienceService';

/** GET /api/student/ai/conversation — messages of the active experiment only. */
export const GET = createRouteHandler({
  handler: async () => {
    const { studentId } = await requireStudent();
    const workspace = await getStudentWorkspace(studentId);

    return jsonOk({
      experimentId: workspace.experiment.id,
      messages: workspace.messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt.toISOString(),
      })),
    });
  },
});