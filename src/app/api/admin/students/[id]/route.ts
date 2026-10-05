import { createRouteHandler, jsonOk } from '@/lib/api';
import {
  updateStudentGroupSchema,
  type UpdateStudentGroupInput,
} from '@/lib/validation';
import { AppError } from '@/lib/errors';
import { requireAdmin } from '@/server/auth/guards';
import { getStudentDetail } from '@/server/services/adminService';
import { studentRepository } from '@/server/db/repositories/accounts';

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
        group: detail.student.group,
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

/**
 * PATCH /api/admin/students/[id] — moves a student to the other group.
 *
 * Only the label changes: the conversation and the versions already written stay
 * exactly where they are, so a misfiled student can be corrected afterwards.
 */
export const PATCH = createRouteHandler<UpdateStudentGroupInput, Context>({
  body: updateStudentGroupSchema,
  handler: async (_request, context, input) => {
    await requireAdmin();
    const { id } = await context.params;
    const student = await studentRepository.updateGroup(id, input.group);
    if (!student) throw new AppError('STUDENT_NOT_FOUND', 404);

    return jsonOk({
      student: {
        id: student.id,
        username: student.username,
        group: student.group,
      },
    });
  },
});