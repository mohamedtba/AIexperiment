import { createRouteHandler, jsonOk } from '@/lib/api';
import { submitExpressionSchema } from '@/lib/validation';
import { requireStudent } from '@/server/auth/guards';
import {
  getStudentWorkspace,
  submitExpression,
} from '@/server/services/studentExperienceService';

/** GET /api/student/expressions — all versions of the active experiment. */
export const GET = createRouteHandler({
  handler: async () => {
    const { studentId } = await requireStudent();
    const workspace = await getStudentWorkspace(studentId);
    return jsonOk({
      experimentId: workspace.experiment.id,
      versions: workspace.versions.map((version) => ({
        id: version.id,
        content: version.content,
        versionNumber: version.versionNumber,
        createdAt: version.createdAt.toISOString(),
      })),
    });
  },
});

/**
 * POST /api/student/expressions
 * Every submission (first text or modification of the latest version) creates a
 * NEW version; previous versions are never modified or deleted.
 */
export const POST = createRouteHandler({
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