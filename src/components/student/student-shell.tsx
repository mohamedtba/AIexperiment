'use client';

import * as React from 'react';
import { GraduationCap } from 'lucide-react';
import { LogoutButton } from '@/components/auth/logout-button';
import { getDictionary } from '@/i18n';

const t = getDictionary();

export function StudentShell({
  username,
  children,
}: {
  username: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-4xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <GraduationCap className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight">
                {t.common.appName}
              </p>
              <p className="truncate text-xs text-muted-foreground">{t.student.dashboardTitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden font-mono text-xs tracking-wide text-muted-foreground sm:inline">
              {username}
            </span>
            <LogoutButton
              label={t.student.logout}
              variant="outline"
              size="sm"
              iconOnly
              redirectTo="/connexion"
            />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-5 sm:px-6 sm:py-7">
        {children}
      </main>

      <footer className="border-t border-border px-4 py-4 text-center text-xs text-muted-foreground sm:px-6">
        {t.auth.footerNote}
      </footer>
    </div>
  );
}