import type { Metadata } from 'next';
import Link from 'next/link';
import { Bot, ChevronRight, FileText, Users } from 'lucide-react';
import { CreateStudentDialog } from '@/components/admin/create-student-dialog';
import { ResetPasswordButton } from '@/components/admin/reset-password-button';
import { ExportPdfButton } from '@/components/admin/export-pdf-button';
import { ChangeStudentGroupButton } from '@/components/admin/change-student-group-button';
import { GroupBadge } from '@/components/admin/group-badge';
import { DeleteStudentButton } from '@/components/admin/delete-student-button';
import { GroupFilter } from '@/components/admin/group-filter';
import { BulkStudentToolbar } from '@/components/admin/bulk-student-toolbar';
import { StopLinkClick } from '@/components/admin/stop-link-click';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/alert';
import { PageHeader } from '@/components/shared/feedback';
import { DateTime, RelativeTime } from '@/components/shared/date-time';
import { Button } from '@/components/ui/button';
import { getDictionary } from '@/i18n';
import { listStudentsWithActivity, getGroupCounts } from '@/server/services/adminService';
import { getCurrentExperiment } from '@/server/services/experimentService';
import { toStudentGroup } from '@/types';

const t = getDictionary();

export const metadata: Metadata = { title: t.students.title };
export const dynamic = 'force-dynamic';

export default async function AdminStudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ groupe?: string }>;
}) {
  const [students, experiment, counts, params] = await Promise.all([
    listStudentsWithActivity(),
    getCurrentExperiment(),
    getGroupCounts(),
    searchParams,
  ]);

  // An unknown or missing filter shows every group rather than an empty page.
  const requested = params.groupe;
  const filter =
    requested === 'AI_LIBRE' || requested === 'AI_GUIDEE' ? requested : null;
  const visible = filter ? students.filter((s) => s.group === filter) : students;

  const summary = t.students.groupCounts
    .replace('{libre}', String(counts.AI_LIBRE))
    .replace('{guidee}', String(counts.AI_GUIDEE));

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.students.title}
        subtitle={t.students.subtitle}
        actions={<CreateStudentDialog />}
      />

      {students.length > 0 ? (
        <GroupFilter
          counts={counts}
          active={filter}
          summary={summary}
          total={students.length}
          shown={visible.length}
        />
      ) : null}
      {students.length > 0 ? <BulkStudentToolbar /> : null}

      {students.length === 0 ? (
        <Card>
          <CardContent className="pt-5 sm:pt-6">
            <EmptyState
              icon={<Users className="h-6 w-6" />}
              title={t.students.empty}
              description={t.students.emptyHint}
              action={<CreateStudentDialog />}
            />
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Tableau (bureau) */}
          <Card className="hidden overflow-hidden lg:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th scope="col" className="w-10 px-4 py-3">
                    <input type="checkbox" className="student-bulk-checkbox h-4 w-4" aria-label={t.students.selectAll} data-bulk-select-all />
                  </th>
                  <th scope="col" className="px-5 py-3 font-medium">{t.students.username}</th>
                  <th scope="col" className="px-5 py-3 font-medium">{t.students.group}</th>
                  <th scope="col" className="px-5 py-3 font-medium">{t.students.createdAt}</th>
                  <th scope="col" className="px-5 py-3 font-medium">{t.students.aiUsage}</th>
                  <th scope="col" className="px-5 py-3 font-medium">{t.students.expressions}</th>
                  <th scope="col" className="px-5 py-3 font-medium">{t.students.lastActivity}</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">
                    {t.common.seeDetails}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.map((student) => (
                  <tr key={student.id} className="transition-colors hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        className="student-bulk-checkbox h-4 w-4"
                        value={student.id}
                        data-username={student.username}
                        data-group={student.group}
                        aria-label={`${t.students.selectStudent} ${student.username}`}
                      />
                    </td>
                    <td className="px-5 py-3">
                      <span className="font-mono font-semibold tracking-wide">{student.username}</span>
                    </td>
                    <td className="px-5 py-3">
                      <GroupBadge group={student.group} />
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      <DateTime value={student.createdAt} mode="date" />
                    </td>
                    <td className="px-5 py-3">
                      <ActivityCell
                        icon={<Bot className="h-3.5 w-3.5 text-ai" />}
                        value={student.activity.aiMessages}
                        label={t.common.messages}
                        empty={!student.activity.aiMessages}
                      />
                    </td>
                    <td className="px-5 py-3">
                      <ActivityCell
                        icon={<FileText className="h-3.5 w-3.5 text-success" />}
                        value={student.activity.expressionVersions}
                        label={t.common.versions}
                        empty={!student.activity.expressionVersions}
                      />
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      <RelativeTime value={student.activity.lastActivityAt} />
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap justify-end gap-2">
                        <ExportPdfButton studentId={student.id} />
                        <ResetPasswordButton studentId={student.id} />
                        <Button asChild variant="outline" size="xs">
                          <Link href={`/admin/etudiants/${student.id}`}>
                            {t.students.openDetail}
                            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                          </Link>
                        </Button>
                        <DeleteStudentButton studentId={student.id} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Cartes (mobile) */}
          <ul className="space-y-3 lg:hidden">
            {visible.map((student) => (
              <li key={student.id}>
                <div className="rounded-lg border border-border bg-card p-4 shadow-card">
                  <Link
                    href={`/admin/etudiants/${student.id}`}
                    className="block transition-colors hover:opacity-90"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        {/* Cliquer sur la case ne doit pas ouvrir la fiche étudiant. */}
                        <StopLinkClick>
                          <input
                            type="checkbox"
                            className="student-bulk-checkbox h-4 w-4"
                            value={student.id}
                            data-username={student.username}
                            data-group={student.group}
                            aria-label={`${t.students.selectStudent} ${student.username}`}
                          />
                        </StopLinkClick>
                        <span className="font-mono text-base font-semibold tracking-wide">
                          {student.username}
                        </span>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    </div>

                    <div className="mt-2">
                      <GroupBadge group={student.group} />
                    </div>

                    <p className="mt-2 text-xs text-muted-foreground">
                      {t.students.createdAt} <DateTime value={student.createdAt} mode="date" />
                    </p>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Badge variant={student.activity.aiMessages > 0 ? 'ai' : 'neutral'}>
                        <Bot className="h-3 w-3" aria-hidden />
                        {t.common.plural(
                          student.activity.aiMessages,
                          t.common.message,
                          t.common.messages,
                        )}
                      </Badge>
                      <Badge variant={student.activity.expressionVersions > 0 ? 'success' : 'neutral'}>
                        <FileText className="h-3 w-3" aria-hidden />
                        {t.common.plural(
                          student.activity.expressionVersions,
                          t.common.version,
                          t.common.versions,
                        )}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {t.students.lastActivity} :{' '}
                        <RelativeTime value={student.activity.lastActivityAt} />
                      </span>
                    </div>

                    {experiment ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {t.students.activity} :{' '}
                        {t.experiments.experimentNumber.replace('{n}', String(experiment.sequence))}
                      </p>
                    ) : null}
                  </Link>

                  {/* Hors du lien : un bouton dans un lien serait inaccessible au clavier. */}
                  <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
                    <ChangeStudentGroupButton
                      studentId={student.id}
                      group={toStudentGroup(student.group)}
                    />
                    <ExportPdfButton studentId={student.id} size="sm" />
                    <ResetPasswordButton studentId={student.id} size="sm" />
                    <DeleteStudentButton studentId={student.id} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function ActivityCell({
  icon,
  value,
  label,
  empty,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  empty: boolean;
}) {
  if (empty) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5 tabular-nums">
      {icon}
      {value} {label}
    </span>
  );
}