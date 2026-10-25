import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/ThemeProvider';
import Script from 'next/script';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'Chatly',
  description: 'A mobile-first AI chat web app with clean, fast performance and zero layout jank.',
  manifest: '/manifest.webmanifest',
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
      <head>
        <meta name="theme-color" content="#7C5CFF" />
      </head>
      <body suppressHydrationWarning className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Script id="register-sw" strategy="afterInteractive">
            {`
              if (location.protocol === 'https:' && location.hostname !== 'localhost' && 'serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                  navigator.serviceWorker.register('/sw.js');
                });
              }
            `}
          </Script>
        </ThemeProvider>
      </body>
    </html>
  );
}
