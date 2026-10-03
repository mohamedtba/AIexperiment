'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';

interface LogoutButtonProps extends Omit<ButtonProps, 'onClick' | 'children'> {
  label: string;
  redirectTo?: string;
  iconOnly?: boolean;
}

/** Signs the user out server-side (cookie) and returns to the login screen. */
export function LogoutButton({
  label,
  redirectTo = '/connexion',
  iconOnly = false,
  variant = 'ghost',
  size = 'sm',
  className,
  ...props
}: LogoutButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);

  async function handleLogout() {
    setLoading(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Even if the request fails, the interface returns to the login screen.
    }
    router.replace(redirectTo);
    router.refresh();
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      loading={loading}
      onClick={handleLogout}
      aria-label={iconOnly ? label : undefined}
      title={iconOnly ? label : undefined}
      className={className}
      {...props}
    >
      <LogOut className="h-4 w-4" aria-hidden />
      {iconOnly ? null : label}
    </Button>
  );
}