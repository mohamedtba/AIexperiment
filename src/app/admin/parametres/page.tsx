import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import {
  Bot,
  CalendarDays,
  KeyRound,
  LogIn,
  Server,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AccessControl } from '@/components/admin/access-control';
import { PageHeader } from '@/components/shared/feedback';
import { DateTime } from '@/components/shared/date-time';
import { getDictionary } from '@/i18n';
import { formatDateTimeFr } from '@/lib/utils';
import { getSession } from '@/server/auth/session';
import { getAccessSettings } from '@/server/services/accessService';
import { getAIProviderInfo } from '@/server/ai/aiService';
import { adminRepository } from '@/server/db/repositories/accounts';

const t = getDictionary();

export const metadata: Metadata = { title: t.settings.title };
export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  const session = await getSession();
  if (!session) redirect('/connexion');
  if (session.role !== 'admin') redirect('/etudiant');

  const [admin, access, ai] = await Promise.all([
    adminRepository.findById(session.userId),
    getAccessSettings(),
    Promise.resolve(getAIProviderInfo()),
  ]);

  const rows: Array<{ icon: typeof KeyRound; label: string; value: string }> = [
    { icon: KeyRound, label: t.settings.username, value: admin?.username ?? session.username },
    {
      icon: CalendarDays,
      label: t.settings.createdAt,
      value: admin ? formatDateTimeFr(admin.createdAt) : '—',
    },
    {
      icon: LogIn,
      label: t.settings.lastLogin,
      value: admin?.lastLoginAt ? formatDateTimeFr(admin.lastLoginAt) : t.students.never,
    },
    { icon: ShieldCheck, label: t.settings.securityHash, value: t.settings.securityHashValue },
    { icon: KeyRound, label: t.settings.securitySessions, value: t.settings.securitySessionsValue },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t.settings.title} subtitle={t.settings.subtitle} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t.settings.profile}</CardTitle>
            <CardDescription>{t.common.adminArea}</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="divide-y divide-border">
              {rows.map((row) => {
                const Icon = row.icon;
                return (
                  <div key={row.label} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <dt className="w-40 shrink-0 text-sm text-muted-foreground">{row.label}</dt>
                    <dd className="min-w-0 flex-1 break-words text-sm font-medium">
                      {row.value}
                      {row.label === t.settings.username ? (
                        <Badge variant="neutral" className="ml-2">
                          {t.auth.adminTab}
                        </Badge>
                      ) : null}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-ai" aria-hidden />
                {t.settings.aiService}
              </CardTitle>
              <CardDescription>{t.student.aiSubtitle}</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="divide-y divide-border">
                <div className="flex items-center justify-between gap-3 py-2.5">
                  <dt className="text-sm text-muted-foreground">{t.settings.aiProvider}</dt>
                  <dd className="text-sm font-medium">{ai.provider}</dd>
                </div>
                <div className="flex items-center justify-between gap-3 py-2.5">
                  <dt className="text-sm text-muted-foreground">{t.settings.aiModel}</dt>
                  <dd className="font-mono text-sm font-medium">{ai.model}</dd>
                </div>
                <div className="flex items-center justify-between gap-3 py-2.5">
                  <dt className="text-sm text-muted-foreground">{t.settings.aiStatus}</dt>
                  <dd>
                    <Badge variant={ai.configured ? 'success' : 'warning'}>
                      {ai.configured ? t.settings.aiConfigured : t.settings.aiNotConfigured}
                    </Badge>
                  </dd>
                </div>
              </dl>
              {!ai.configured ? (
                <p className="mt-3 rounded-md bg-warning-soft p-3 text-xs leading-relaxed text-warning">
                  {t.settings.aiNotConfiguredHint}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
                {t.settings.accessControl}
              </CardTitle>
              <CardDescription>{t.access.toggleDescription}</CardDescription>
            </CardHeader>
            <CardContent>
              <AccessControl
                initialEnabled={access.studentAccessEnabled}
                updatedAtLabel={formatDateTimeFr(access.updatedAt)}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-4 w-4 text-primary" aria-hidden />
            {t.settings.about}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed text-muted-foreground">{t.settings.aboutValue}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">
              <Sparkles className="h-3 w-3" aria-hidden />
              Next.js · MongoDB · {ai.provider}
            </Badge>
            <span>
              {t.common.appName} · <DateTime value={new Date()} mode="date" />
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}