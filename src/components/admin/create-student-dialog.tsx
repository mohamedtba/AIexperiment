'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, Copy, KeyRound, Minus, Plus, UserPlus } from 'lucide-react';
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
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { getDictionary } from '@/i18n';
import { ERROR_MESSAGES } from '@/lib/errors';
import { CredentialRow } from './credential-row';

const t = getDictionary();

const MAX_QUANTITY = 50;

interface CreatedAccount {
  username: string;
  password: string;
  group: 'AI_LIBRE' | 'AI_GUIDEE';
}

/**
 * Creates student accounts in one of the two study groups.
 *
 * A class is created group by group, so the dialog asks for the group and for
 * how many accounts to generate at once (up to 50). Credentials are shown once
 * and can be copied in a single click, formatted ready to be printed and handed
 * out.
 */
export function CreateStudentDialog() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [group, setGroup] = React.useState<'AI_LIBRE' | 'AI_GUIDEE'>('AI_LIBRE');
  const [quantity, setQuantity] = React.useState(1);
  const [accounts, setAccounts] = React.useState<CreatedAccount[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState<'all' | string | null>(null);

  function reset() {
    setAccounts(null);
    setError(null);
    setCopied(null);
    setQuantity(1);
  }

  /** Copies one value and flashes the matching row for two seconds. */
  async function copyOne(value: string, key: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error(ERROR_MESSAGES.SERVER_ERROR);
    }
  }

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group, quantity }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok || !Array.isArray(data?.accounts) || data.accounts.length === 0) {
        throw new Error(data?.error?.message ?? ERROR_MESSAGES.SERVER_ERROR);
      }

      setAccounts(
        data.accounts.map((account: CreatedAccount) => ({
          username: account.username,
          password: account.password,
          group: account.group,
        })),
      );
      toast.success(
        data.accounts.length === 1
          ? t.students.created
          : t.students.createdMany.replace('{n}', String(data.accounts.length)),
      );
      router.refresh();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : ERROR_MESSAGES.SERVER_ERROR;
      setError(message);
      toast.error(message);
    } finally {
      setCreating(false);
    }
  }

  async function copyAll() {
    // All the accounts come from a single request, so they share one group.
    const first = accounts?.[0];
    if (!first) return;
    const label = t.groups[first.group];
    // One line per account: the list can be printed and handed out as is.
    const text = (accounts ?? [])
      .map((account) => `${account.username} / ${account.password} — ${label}`)
      .join('\n');
    await copyOne(text, 'all');
  }

  const single = accounts !== null && accounts.length === 1;
  // Safe: every account of one request carries the same group.
  const groupLabel = accounts?.[0] ? t.groups[accounts[0].group] : '';

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

      <DialogContent className="sm:max-w-lg">
        {accounts ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Check className="h-5 w-5 text-success" aria-hidden />
                {t.students.credentialsTitle}
              </DialogTitle>
              <DialogDescription>
                {single ? t.students.credentialsBodySingle : t.students.credentialsBody}
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 space-y-3">
              <p className="text-xs font-medium text-muted-foreground">{groupLabel}</p>
              <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
                {accounts.map((account) => (
                  <div key={account.username} className="space-y-2">
                    <CredentialRow
                      label={t.students.credentialsUsername}
                      value={account.username}
                      onCopy={() => void copyOne(account.username, `u-${account.username}`)}
                      copied={copied === `u-${account.username}`}
                    />
                    <CredentialRow
                      label={t.students.credentialsPassword}
                      value={account.password}
                      onCopy={() => void copyOne(account.password, `p-${account.username}`)}
                      copied={copied === `p-${account.username}`}
                    />
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => void copyAll()}>
                {copied === 'all' ? (
                  <Check className="h-4 w-4 text-success" aria-hidden />
                ) : (
                  <Copy className="h-4 w-4" aria-hidden />
                )}
                {copied === 'all' ? t.common.copied : t.students.copyAllList}
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

            <div className="mt-4 space-y-4">
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-foreground">
                  {t.students.groupLabel}
                </legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(['AI_LIBRE', 'AI_GUIDEE'] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setGroup(value)}
                      aria-pressed={group === value}
                      className={cn(
                        'rounded-lg border p-3 text-left transition-colors',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        group === value
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:bg-muted/50',
                      )}
                    >
                      <span className="flex items-center gap-2 text-sm font-medium">
                        {group === value ? (
                          <Check className="h-4 w-4 text-primary" aria-hidden />
                        ) : null}
                        {t.groups[value]}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {value === 'AI_LIBRE' ? t.groups.freeDetail : t.groups.guidedDetail}
                      </span>
                    </button>
                  ))}
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t.groups.description}
                </p>
              </fieldset>

              <div className="space-y-2">
                <Label htmlFor="student-quantity">{t.students.quantityLabel}</Label>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                    disabled={quantity <= 1 || creating}
                    aria-label="Retirer un étudiant"
                  >
                    <Minus className="h-4 w-4" aria-hidden />
                  </Button>
                  <input
                    id="student-quantity"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={MAX_QUANTITY}
                    value={quantity}
                    disabled={creating}
                    onChange={(event) => {
                      const parsed = Number.parseInt(event.target.value, 10);
                      if (Number.isNaN(parsed)) return;
                      setQuantity(Math.min(MAX_QUANTITY, Math.max(1, parsed)));
                    }}
                    className="h-9 w-16 rounded-md border border-border bg-card text-center text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-55"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setQuantity((value) => Math.min(MAX_QUANTITY, value + 1))}
                    disabled={quantity >= MAX_QUANTITY || creating}
                    aria-label="Ajouter un étudiant"
                  >
                    <Plus className="h-4 w-4" aria-hidden />
                  </Button>
                  <span className="text-xs text-muted-foreground">{t.students.quantityHint}</span>
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