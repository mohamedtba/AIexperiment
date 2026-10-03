import { createRouteHandler, jsonOk } from '@/lib/api';
import { clearSessionCookie } from '@/server/auth/session';

/** POST /api/auth/logout — shared by the administrator and the students. */
export const POST = createRouteHandler({
  handler: async () => {
    await clearSessionCookie();
    return jsonOk({ success: true });
  },
});