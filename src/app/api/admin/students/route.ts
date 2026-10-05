import { createRouteHandler, jsonOk } from '@/lib/api';
import { createStudentsSchema, type CreateStudentsInput } from '@/lib/validation';
import { requireAdmin } from '@/server/auth/guards';
import { listStudentsWithActivity } from '@/server/services/adminService';
import { createStudentAccounts } from '@/server/services/authService';
import { studentRepository } from '@/server/db/repositories/accounts';

/** GET /api/admin/students — list with activity on the active experiment. */
export const GET = createRouteHandler({
  handler: async () => {
    await requireAdmin();
    const [students, counts] = await Promise.all([
      listStudentsWithActivity(),
      studentRepository.countByGroup(),
    ]);
    return jsonOk({
      students: students.map((student) => ({
        ...student,
        createdAt: student.createdAt.toISOString(),
        lastLoginAt: student.lastLoginAt?.toISOString() ?? null,
        activity: student.activity
          ? {
              ...student.activity,
              experimentId: student.activity.experimentId || null,
              lastActivityAt: student.activity.lastActivityAt?.toISOString() ?? null,
            }
          : null,
      })),
      counts,
    });
  },
});

/**
 * POST /api/admin/students — creates one or several accounts with generated
 * credentials. The class is split into two groups, so the body carries both the
 * group and how many students to create.
 */
export const POST = createRouteHandler<CreateStudentsInput>({
  body: createStudentsSchema,
  handler: async (_request, _context, input) => {
    await requireAdmin();
    const accounts = await createStudentAccounts(input.group, input.quantity);
    return jsonOk(
      {
        accounts: accounts.map(({ student, password }) => ({
          id: student.id,
          username: student.username,
          password,
          group: student.group,
          createdAt: student.createdAt.toISOString(),
        })),
      },
      { status: 201 },
    );
  },
});