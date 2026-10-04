import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { getDictionary } from '@/i18n';

const t = getDictionary();

/**
 * Banner displayed at the top of the administrator area when PostgreSQL cannot
 * be reached (wrong `DATABASE_URL`, unreachable host, firewall…). The
 * session itself is still valid, so the administrator keeps the access switch
 * and can retry once the database is back.
 */
export function DatabaseOutageNotice() {
  return (
    <Alert tone="warning" icon={<AlertTriangle className="h-4 w-4" />} className="mb-6">
      <p className="font-medium">{t.errors.databaseTitle}</p>
      <p className="mt-1">{t.errors.databaseBody}</p>
      <a
        href="/admin"
        className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium underline underline-offset-4"
      >
        <RefreshCw className="h-3.5 w-3.5" aria-hidden />
        {t.common.retry}
      </a>
    </Alert>
  );
}