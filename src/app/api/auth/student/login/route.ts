import { createRouteHandler, jsonOk } from '@/lib/api';
import { studentLoginSchema } from '@/lib/validation';
import { loginStudent } from '@/server/services/authService';
import { setSessionCookie } from '@/server/auth/session';

/** POST /api/auth/student/login */
export const POST = createRouteHandler({
  body: studentLoginSchema,
  handler: async (request, _context, input) => {
    const result = await loginStudent(input, request);
    await setSessionCookie({
      userId: result.student.id,
      username: result.student.username,
      role: 'student',
      accessEpoch: result.accessEpoch,
      passwordVersion: result.passwordVersion,
    });
    return jsonOk({ username: result.student.username });
  },
});