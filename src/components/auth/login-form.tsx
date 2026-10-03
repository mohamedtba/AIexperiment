'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Bot, GraduationCap, KeyRound, LogIn, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { getDictionary } from '@/i18n';
import { cn } from '@/lib/utils';
import { ERROR_MESSAGES } from '@/lib/errors';

const t = getDictionary();

type Role = 'student' | 'admin';

interface ApiError {
  error?: { code?: string; message?: string };
}

export function LoginForm() {
  const router = useRouter();
  const [role, setRole] = React.useState<Role>('student');
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [status, setStatus] = React.useState<{
    studentAccessEnabled: boolean | null;
  }>({ studentAccessEnabled: null });

  React.useEffect(() => {
    let active = true;
    fetch('/api/system/status', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { studentAccessEnabled?: boolean } | null) => {
        if (active && data && typeof data.studentAccessEnabled === 'boolean') {
          setStatus({ studentAccessEnabled: data.studentAccessEnabled });
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const accessDisabled = status.studentAccessEnabled === false;
  const isAdmin = role === 'admin';

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!username.trim() || !password.trim()) {
      setError(ERROR_MESSAGES.MISSING_CREDENTIALS);
      return;
    }

    setLoading(true);
    try {
      const endpoint = isAdmin ? '/api/auth/admin/login' : '/api/auth/student/login';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password: password.trim() }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as ApiError | null;
        setError(data?.error?.message ?? ERROR_MESSAGES.SERVER_ERROR);
        setLoading(false);
        return;
      }

      router.push(isAdmin ? '/admin' : '/etudiant');
      router.refresh();
    } catch {
      setError(ERROR_MESSAGES.SERVER_ERROR);
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md">
      <div className="mb-6 flex flex-col items-center gap-3 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <GraduationCap className="h-6 w-6" aria-hidden />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {t.common.appName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t.auth.loginSubtitle}</p>
        </div>
      </div>

      <div className="card-surface p-5 sm:p-6">
        <div
          role="tablist"
          aria-label={t.auth.loginTitle}
          className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
        >
          {(
            [
              { value: 'student' as const, label: t.auth.studentTab, icon: Bot },
              { value: 'admin' as const, label: t.auth.adminTab, icon: ShieldCheck },
            ]
          ).map((tab) => {
            const Icon = tab.icon;
            const selected = role === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => {
                  setRole(tab.value);
                  setError(null);
                }}
                className={cn(
                  'flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  selected
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {tab.label}
              </button>
            );
          })}
        </div>

        {accessDisabled && !isAdmin ? (
          <Alert tone="warning" className="mb-4" icon={<ShieldCheck className="h-4 w-4" />}>
            {ERROR_MESSAGES.STUDENT_ACCESS_DISABLED}
          </Alert>
        ) : null}

        {error ? (
          <Alert tone="destructive" className="mb-4">
            {error}
          </Alert>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="username">{t.auth.username}</Label>
            <Input
              id="username"
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode={isAdmin ? 'text' : 'text'}
              placeholder={
                isAdmin ? t.auth.usernamePlaceholderAdmin : t.auth.usernamePlaceholderStudent
              }
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="font-mono tracking-wide"
              maxLength={64}
              required
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">{t.auth.password}</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              inputMode="numeric"
              placeholder={t.auth.passwordPlaceholder}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="font-mono tracking-[0.3em]"
              maxLength={128}
              required
            />
          </div>

          <Button
            type="submit"
            full
            loading={loading}
            variant={isAdmin ? 'outline' : 'default'}
            disabled={!isAdmin && accessDisabled}
          >
            <LogIn className="h-4 w-4" aria-hidden />
            {loading ? t.auth.loggingIn : isAdmin ? t.auth.submitAdmin : t.auth.submitStudent}
          </Button>

          <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
            <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            {isAdmin ? t.settings.securitySessionsValue : t.auth.studentHint}
          </p>
        </form>
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">{t.auth.footerNote}</p>
    </div>
  );
}