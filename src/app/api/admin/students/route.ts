import { createRouteHandler, jsonOk } from '@/lib/api';
import { requireAdmin } from '@/server/auth/guards';
import { listStudentsWithActivity } from '@/server/services/adminService';
import { createStudentAccount } from '@/server/services/authService';

/** GET /api/admin/students — list with activity on the active experiment. */
export const GET = createRouteHandler({
  handler: async () => {
    await requireAdmin();
    const students = await listStudentsWithActivity();
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
    });
  },
});

/** POST /api/admin/students — creates an account with generated credentials. */
export const POST = createRouteHandler({
  handler: async () => {
    await requireAdmin();
    const { student, password } = await createStudentAccount();
    return jsonOk(
      {
        student: {
          id: student.id,
          username: student.username,
          createdAt: student.createdAt.toISOString(),
        },
        password,
      },
      { status: 201 },
    );
  },
});