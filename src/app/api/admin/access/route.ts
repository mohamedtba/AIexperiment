import { createRouteHandler, jsonOk } from '@/lib/api';
import { toggleAccessSchema, toggleGroupAccessSchema } from '@/lib/validation';
import { requireAdmin } from '@/server/auth/guards';
import {
  getAccessSettings,
  setGroupLoginAllowed,
  updateStudentAccess,
} from '@/server/services/accessService';

/** GET /api/admin/access — current state of the global access switch. */
export const GET = createRouteHandler({
  handler: async () => {
    await requireAdmin();
    const settings = await getAccessSettings();
    return jsonOk({
      studentAccessEnabled: settings.studentAccessEnabled,
      updatedAt: settings.updatedAt.toISOString(),
      disabledAt: settings.disabledAt?.toISOString() ?? null,
      loginAiLibre: settings.loginAiLibre,
      loginAiGuidee: settings.loginAiGuidee,
    });
  },
});

export const PUT = createRouteHandler({
  body: toggleGroupAccessSchema,
  handler: async (_request, _context, input) => {
    await requireAdmin();
    const settings = await setGroupLoginAllowed(input.group, input.allowed);
    return jsonOk({
      loginAiLibre: settings.loginAiLibre,
      loginAiGuidee: settings.loginAiGuidee,
    });
  },
});

/**
 * POST /api/admin/access
 * Turning the switch OFF immediately revokes every student session (the epoch
 * embedded in the sessions no longer matches the database).
 */
export const POST = createRouteHandler({
  body: toggleAccessSchema,
  handler: async (_request, _context, input) => {
    await requireAdmin();
    const settings = await updateStudentAccess(input.enabled);
    return jsonOk({
      studentAccessEnabled: settings.studentAccessEnabled,
      updatedAt: settings.updatedAt.toISOString(),
      disabledAt: settings.disabledAt?.toISOString() ?? null,
      loginAiLibre: settings.loginAiLibre,
      loginAiGuidee: settings.loginAiGuidee,
    });
  },
});