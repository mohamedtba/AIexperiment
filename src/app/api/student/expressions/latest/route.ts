import { createRouteHandler, jsonOk } from '@/lib/api';
import { submitExpressionSchema } from '@/lib/validation';
import { requireStudent } from '@/server/auth/guards';
import {
  getStudentLatestVersion,
  submitExpression,
} from '@/server/services/studentExperienceService';

/**
 * GET /api/student/expressions/latest — text to load in the editor when the
 * student clicks « Modifier ».
 */
export const GET = createRouteHandler({
  handler: async () => {
    const { studentId } = await requireStudent();
    const version = await getStudentLatestVersion(studentId);
    return jsonOk({
      version: version
        ? {
            id: version.id,
            content: version.content,
            versionNumber: version.versionNumber,
            createdAt: version.createdAt.toISOString(),
          }
        : null,
    });
  },
});

/**
 * PATCH /api/student/expressions/latest
 * Saving an edited text creates a new version (the previous one is preserved).
 */
export const PATCH = createRouteHandler({
  body: submitExpressionSchema,
  handler: async (_request, _context, input) => {
    const { studentId } = await requireStudent();
    const version = await submitExpression(studentId, input.content, input.clientRequestId);
    return jsonOk(
      {
        version: {
          id: version.id,
          content: version.content,
          versionNumber: version.versionNumber,
          createdAt: version.createdAt.toISOString(),
        },
      },
      { status: 201 },
    );
  },
});