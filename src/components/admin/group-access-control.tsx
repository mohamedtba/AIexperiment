'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Lock } from 'lucide-react';
import { getDictionary } from '@/i18n';
import { ERROR_MESSAGES } from '@/lib/errors';
import { Alert } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';

const t = getDictionary();

/**
 * Per-group login switches. Every group can be independently allowed or
 * forbidden; sessions of a newly forbidden group are refused on the next
 * request, and students of the other group are never affected.
 */
export function GroupAccessControl({
  initialLibre,
  initialGuidee,
}: {
  initialLibre: boolean;
  initialGuidee: boolean;
}) {
  const router = useRouter();
  const [libre, setLibre] = React.useState(initialLibre);
  const [guidee, setGuidee] = React.useState(initialGuidee);
  const [saving, setSaving] = React.useState<'libre' | 'guidee' | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => setLibre(initialLibre), [initialLibre]);
  React.useEffect(() => setGuidee(initialGuidee), [initialGuidee]);

  async function apply(group: 'AI_LIBRE' | 'AI_GUIDEE', allowed: boolean) {
    setSaving(group === 'AI_LIBRE' ? 'libre' : 'guidee');
    setError(null);
    try {
      const response = await fetch('/api/admin/access', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group, allowed }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error?.message ?? ERROR_MESSAGES.SERVER_ERROR);

      if (group === 'AI_LIBRE') setLibre(allowed);
      else setGuidee(allowed);
      toast.success(allowed ? t.access.groupAllowed : t.access.groupSuspended);
      router.refresh();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : ERROR_MESSAGES.SERVER_ERROR;
      setError(message);
      toast.error(message);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{t.access.groupToggleDescription}</p>

      {(
        [
          { key: 'AI_LIBRE', label: 'IA libre', value: libre, saving: saving === 'libre' },
          { key: 'AI_GUIDEE', label: 'IA guidée', value: guidee, saving: saving === 'guidee' },
        ] as const
      ).map((row) => (
        <div
          key={row.key}
          className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
        >
          <span className="text-sm font-medium">{row.label}</span>
          <Switch
            checked={row.value}
            label={row.label}
            disabled={row.saving}
            onCheckedChange={(next) => void apply(row.key, next)}
          />
        </div>
      ))}

      {error ? <Alert tone="destructive">{error}</Alert> : null}
      {libre === false && guidee === false ? (
        <Alert tone="warning" icon={<Lock className="h-4 w-4" />}>
          {t.access.bothGroupsSuspended}
        </Alert>
      ) : null}
    </div>
  );
}
