import { createRouteHandler, jsonOk } from '@/lib/api';
import { idParamSchema } from '@/lib/validation';
import { requireAdmin } from '@/server/auth/guards';
import { resetStudentPassword } from '@/server/services/authService';

interface Context {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/admin/students/[id]/password — administrator only.
 *
 * Generates a new 4-digit password for the student. The plaintext password is
 * returned once (it is never stored in clear) and the sessions opened with the
 * previous password are revoked.
 */
export const POST = createRouteHandler<never, Context>({
  handler: async (_request, context) => {
    await requireAdmin();
    const { id } = await context.params;
    const studentId = idParamSchema.parse(id);

    const credentials = await resetStudentPassword(studentId);

    return jsonOk(
      {
        student: { id: studentId, username: credentials.username },
        password: credentials.password,
      },
      { status: 201 },
    );
  },
});