import type { Metadata } from 'next';
import { LoginForm } from '@/components/auth/login-form';
import { getDictionary } from '@/i18n';

const t = getDictionary();

export const metadata: Metadata = {
  title: t.auth.loginTitle,
};

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <LoginForm />
    </main>
  );
}