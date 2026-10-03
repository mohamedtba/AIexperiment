'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, Copy, KeyRound, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Alert } from '@/components/ui/alert';
import { getDictionary } from '@/i18n';
import { ERROR_MESSAGES } from '@/lib/errors';

const t = getDictionary();

interface Credentials {
  username: string;
  password: string;
}

/**
 * Creates a student account. The username (6 lowercase letters) and the
 * password (4 digits) are generated server-side and displayed only once.
 */
export function CreateStudentDialog() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [credentials, setCredentials] = React.useState<Credentials | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState<'all' | 'username' | 'password' | null>(null);

  function reset() {
    setCredentials(null);
    setError(null);
    setCopied(null);
  }

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/students', { method: 'POST' });
      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.student?.username) {
        throw new Error(data?.error?.message ?? ERROR_MESSAGES.SERVER_ERROR);
      }

      setCredentials({ username: data.student.username, password: data.password });
      toast.success(t.students.created);
      router.refresh();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : ERROR_MESSAGES.SERVER_ERROR;
      setError(message);
      toast.error(message);
    } finally {
      setCreating(false);
    }
  }

  async function copy(value: string, target: 'all' | 'username' | 'password') {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(target);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error(ERROR_MESSAGES.SERVER_ERROR);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus className="h-4 w-4" aria-hidden />
          {t.students.create}
        </Button>
      </DialogTrigger>

      <DialogContent>
        {credentials ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Check className="h-5 w-5 text-success" aria-hidden />
                {t.students.credentialsTitle}
              </DialogTitle>
              <DialogDescription>{t.students.credentialsBody}</DialogDescription>
            </DialogHeader>

            <div className="mt-4 space-y-3">
              <CredentialRow
                label={t.students.credentialsUsername}
                value={credentials.username}
                onCopy={() => void copy(credentials.username, 'username')}
                copied={copied === 'username'}
              />
              <CredentialRow
                label={t.students.credentialsPassword}
                value={credentials.password}
                onCopy={() => void copy(credentials.password, 'password')}
                copied={copied === 'password'}
              />
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() =>
                  void copy(
                    `Identifiant : ${credentials.username}\nMot de passe : ${credentials.password}`,
                    'all',
                  )
                }
              >
                {copied === 'all' ? (
                  <Check className="h-4 w-4 text-success" aria-hidden />
                ) : (
                  <Copy className="h-4 w-4" aria-hidden />
                )}
                {copied === 'all' ? t.common.copied : t.students.copyAll}
              </Button>
              <Button onClick={() => setOpen(false)}>{t.common.close}</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t.students.createTitle}</DialogTitle>
              <DialogDescription>{t.students.createIntro}</DialogDescription>
            </DialogHeader>

            <div className="mt-4 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-border bg-muted/50 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t.students.credentialsUsername}
                  </p>
                  <p className="mt-1 text-sm text-foreground">6 lettres minuscules</p>
                </div>
                <div className="rounded-lg border border-border bg-muted/50 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t.students.credentialsPassword}
                  </p>
                  <p className="mt-1 text-sm text-foreground">4 chiffres</p>
                </div>
              </div>

              {error ? <Alert tone="destructive">{error}</Alert> : null}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={creating}>
                {t.common.cancel}
              </Button>
              <Button loading={creating} onClick={() => void handleCreate()}>
                <KeyRound className="h-4 w-4" aria-hidden />
                {creating ? t.students.creating : t.students.create}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CredentialRow({
  label,
  value,
  onCopy,
  copied,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 font-mono text-xl font-semibold tracking-[0.2em] text-foreground">
          {value}
        </p>
      </div>
      <Button variant="outline" size="icon" onClick={onCopy} aria-label={`${t.common.copy} ${label}`}>
        {copied ? (
          <Check className="h-4 w-4 text-success" aria-hidden />
        ) : (
          <Copy className="h-4 w-4" aria-hidden />
        )}
      </Button>
    </div>
  );
}