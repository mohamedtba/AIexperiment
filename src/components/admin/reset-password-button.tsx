'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlertTriangle, Check, Copy, KeyRound } from 'lucide-react';
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
import { CredentialRow } from './credential-row';

const t = getDictionary();

/**
 * Administrator action: generates a new 4-digit password for a student.
 *
 * The password is stored only as a bcrypt hash and displayed once. Sessions
 * opened with the previous password are revoked immediately.
 */
export function ResetPasswordButton({
  studentId,
  size = 'xs',
}: {
  studentId: string;
  size?: 'xs' | 'sm';
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [resetting, setResetting] = React.useState(false);
  const [credentials, setCredentials] = React.useState<{
    username: string;
    password: string;
  } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState<'all' | 'username' | 'password' | null>(null);

  function reset() {
    setCredentials(null);
    setError(null);
    setCopied(null);
  }

  async function handleReset() {
    setResetting(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/students/${studentId}/password`, {
        method: 'POST',
      });
      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.password || !data?.student?.username) {
        throw new Error(data?.error?.message ?? ERROR_MESSAGES.SERVER_ERROR);
      }

      setCredentials({ username: data.student.username, password: data.password });
      toast.success(t.students.passwordReset);
      router.refresh();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : ERROR_MESSAGES.SERVER_ERROR;
      setError(message);
      toast.error(message);
    } finally {
      setResetting(false);
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
        <Button variant="outline" size={size} type="button">
          <KeyRound className="h-3.5 w-3.5" aria-hidden />
          {t.students.resetPassword}
        </Button>
      </DialogTrigger>

      <DialogContent>
        {credentials ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Check className="h-5 w-5 text-success" aria-hidden />
                {t.students.newPasswordTitle}
              </DialogTitle>
              <DialogDescription>{t.students.newPasswordBody}</DialogDescription>
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
              <DialogTitle>{t.students.resetPasswordTitle}</DialogTitle>
              <DialogDescription>{t.students.resetPasswordIntro}</DialogDescription>
            </DialogHeader>

            <div className="mt-4 space-y-3">
              <Alert tone="warning" icon={<AlertTriangle className="h-4 w-4" />}>
                {t.students.resetPasswordWarning}
              </Alert>
              {error ? <Alert tone="destructive">{error}</Alert> : null}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={resetting}>
                {t.common.cancel}
              </Button>
              <Button loading={resetting} onClick={() => void handleReset()}>
                <KeyRound className="h-4 w-4" aria-hidden />
                {resetting ? t.students.resetting : t.students.resetPassword}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}