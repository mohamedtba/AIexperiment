import type { Metadata, Viewport } from 'next';
import { Toaster } from 'sonner';
import { getDictionary } from '@/i18n';
import './globals.css';

const t = getDictionary();

/** Public URL of the deployment (optional, used for absolute metadata URLs). */
const siteUrl = process.env.APP_URL?.trim() || 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${t.common.appName} · ${t.common.appTagline}`,
    template: `%s · ${t.common.appName}`,
  },
  description:
    "Plateforme d'expérimentation pédagogique : une question du jour, un assistant IA et une expression écrite dans deux espaces indépendants.",
  applicationName: t.common.appName,
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#F8FAFC',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-dvh bg-background font-sans text-foreground">
        {children}
        <Toaster
          position="top-center"
          richColors
          closeButton
          toastOptions={{
            classNames: {
              toast: 'font-sans text-sm',
            },
          }}
        />
      </body>
    </html>
  );
}