import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/ThemeProvider';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'Chatly',
  description: 'A mobile-first AI chat web app with clean, fast performance and zero layout jank.',
  openGraph: {
    title: 'Chatly',
    description: 'A mobile-first AI chat web app with clean, fast performance and zero layout jank.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Chatly',
    description: 'A mobile-first AI chat web app with clean, fast performance and zero layout jank.',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body suppressHydrationWarning className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
