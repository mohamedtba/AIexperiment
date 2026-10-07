'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BookOpenText,
  History,
  LayoutDashboard,
  Menu,
  Settings,
  Users,
  GraduationCap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { LogoutButton } from '@/components/auth/logout-button';
import { getDictionary } from '@/i18n';
import { cn } from '@/lib/utils';

const t = getDictionary();

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/admin', label: t.nav.dashboard, icon: LayoutDashboard, exact: true },
  { href: '/admin/etudiants', label: t.nav.students, icon: Users },
  { href: '/admin/experience', label: t.nav.currentExperiment, icon: BookOpenText },
  { href: '/admin/experiences-precedentes', label: t.nav.previousExperiments, icon: History },
  { href: '/admin/parametres', label: t.nav.settings, icon: Settings },
];

export function AdminShell({
  username,
  children,
}: {
  username: string;
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const pathname = usePathname();

  React.useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-dvh bg-background">
      {/* Sidebar — desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
        <SidebarContent username={username} />
      </aside>

      {/* Header — mobile */}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-border bg-card/95 px-4 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <GraduationCap className="h-4 w-4" aria-hidden />
          </span>
          <span className="text-sm font-semibold">{t.common.appName}</span>
        </div>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => setMenuOpen(true)}
          aria-label={t.nav.openMenu}
        >
          <Menu className="h-4 w-4" aria-hidden />
        </Button>
      </header>

      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogContent
          className="left-0 top-0 h-dvh w-[17rem] max-w-[85vw] translate-x-0 translate-y-0 rounded-none border-y-0 border-l-0 p-0 sm:rounded-none"
          closeLabel={t.nav.closeMenu}
        >
          <DialogTitle className="sr-only">{t.nav.menu}</DialogTitle>
          <SidebarContent username={username} />
        </DialogContent>
      </Dialog>

      <main className="lg:pl-64">
        <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  );
}

function SidebarContent({ username }: { username: string }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 border-b border-sidebar-border px-5 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white">
          <GraduationCap className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{t.common.appName}</p>
          <p className="truncate text-xs text-sidebar-foreground/70">{t.common.adminArea}</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 p-3" aria-label={t.nav.menu}>
        {NAV_ITEMS.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-md border px-3 py-2.5 text-sm font-semibold transition-colors',
                active
                  ? 'border-white/20 bg-white/15 text-white shadow-sm'
                  : 'border-transparent text-white/90 hover:bg-white/10 hover:text-white',
              )}
            >
              <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-white' : 'text-white/70')} />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3 rounded-md px-3 py-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-xs font-semibold uppercase text-white">
            {username.slice(0, 2)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{username}</p>
            <p className="truncate text-xs text-sidebar-foreground/70">
              {t.auth.adminTab}
            </p>
          </div>
        </div>
        <LogoutButton
          label={t.nav.logout}
          variant="inverse"
          size="sm"
          full
          className="mt-2 justify-start"
        />
      </div>
    </div>
  );
}