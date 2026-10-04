import { createRouteHandler, jsonOk } from '@/lib/api';
import { adminLoginSchema } from '@/lib/validation';
import { loginAdmin } from '@/server/services/authService';
import { setSessionCookie } from '@/server/auth/session';

/** POST /api/auth/admin/login */
export const POST = createRouteHandler({
  body: adminLoginSchema,
  handler: async (request, _context, input) => {
    const result = await loginAdmin(input, request);
    await setSessionCookie({
      userId: result.admin.id,
      username: result.admin.username,
      role: 'admin',
      accessEpoch: 0,
      passwordVersion: 0,
    });
    return jsonOk({ username: result.admin.username });
  },
});