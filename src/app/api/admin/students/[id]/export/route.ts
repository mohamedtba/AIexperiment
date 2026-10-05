import { createRouteHandler } from '@/lib/api';
import { idParamSchema } from '@/lib/validation';
import { AppError } from '@/lib/errors';
import { requireAdmin } from '@/server/auth/guards';
import { getStudentDetail } from '@/server/services/adminService';
import { buildStudentPdf, studentPdfFileName } from '@/server/pdf/buildStudentPdf';

interface Context {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/admin/students/[id]/export — PDF transcript of one student.
 *
 * The active experiment is used by default; `?experimentId=` exports an archived
 * one, which is what the previous-experiments screens link to.
 *
 * The response is a real file (`Content-Disposition: attachment`), so the browser
 * saves it without ever leaving the page, and it carries `no-store` so a
 * transcript can never be cached by a shared proxy.
 */
export const GET = createRouteHandler<never, Context>({
  handler: async (request, context) => {
    await requireAdmin();
    const { id } = await context.params;
    if (!idParamSchema.safeParse(id).success) throw new AppError('STUDENT_NOT_FOUND', 404);

    const url = new URL(request.url);
    const experimentId = url.searchParams.get('experimentId');
    if (experimentId && !idParamSchema.safeParse(experimentId).success) {
      throw new AppError('EXPERIMENT_NOT_FOUND', 404);
    }

    const detail = await getStudentDetail(id, experimentId ?? undefined);
    if (!detail.experiment) throw new AppError('EXPERIMENT_NOT_FOUND', 404);

    const pdf = await buildStudentPdf({
      student: detail.student,
      experiment: detail.experiment,
      messages: detail.messages,
      versions: detail.versions,
    });

    const fileName = studentPdfFileName(detail.student, detail.experiment);

    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(pdf.byteLength),
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  },
});