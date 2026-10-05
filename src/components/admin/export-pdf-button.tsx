'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getDictionary } from '@/i18n';
import { ERROR_MESSAGES } from '@/lib/errors';

const t = getDictionary();

/**
 * Downloads the PDF transcript of a student.
 *
 * The file is generated on the server from the data the teacher is looking at,
 * so what is downloaded is exactly what the screen shows. `experimentId` targets
 * an archived experiment; without it the active one is exported.
 */
export function ExportPdfButton({
  studentId,
  experimentId,
  size = 'xs',
  className,
}: {
  studentId: string;
  experimentId?: string;
  size?: 'xs' | 'sm';
  className?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);

  async function download() {
    setLoading(true);
    try {
      const query = experimentId ? `?experimentId=${encodeURIComponent(experimentId)}` : '';
      const response = await fetch(`/api/admin/students/${studentId}/export${query}`);

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error?.message ?? ERROR_MESSAGES.SERVER_ERROR);
      }

      // The filename is set by the server; read it back so the file is named
      // after the student and the experiment.
      const disposition = response.headers.get('Content-Disposition') ?? '';
      const match = /filename="([^"]+)"/.exec(disposition);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = match?.[1] ?? 'export.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      toast.success(t.students.exportPdfSuccess);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : ERROR_MESSAGES.SERVER_ERROR);
    } finally {
      setLoading(false);
      // The student list holds activity counters: keep them honest after an export.
      router.refresh();
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      className={className}
      loading={loading}
      onClick={() => void download()}
    >
      <FileDown className="h-3.5 w-3.5" aria-hidden />
      {loading ? t.students.exportPdfLoading : t.students.exportPdf}
    </Button>
  );
}