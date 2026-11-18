import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Sidebar from '@/components/Sidebar';
import MobileBottomNav from '@/components/MobileBottomNav';
import PwaRegister from '@/components/PwaRegister';
import AppSplashLoader from '@/components/AppSplashLoader';
import { ThemeProvider } from '@/context/ThemeContext';
import { NavigationProvider } from '@/context/NavigationContext';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'Evolve - Personal AI Platform',
  description:
    'Your personal AI-powered life operating system for notes, tasks, finance, habits, and focus.',
  manifest: '/manifest.json?v=2',
  icons: {
    icon: [
      { url: '/favicon.ico?v=2', sizes: 'any' },
      { url: '/icon-192.png?v=2', type: 'image/png', sizes: '192x192' },
      { url: '/icon-512.png?v=2', type: 'image/png', sizes: '512x512' },
    ],
    shortcut: '/icon-192.png?v=2',
    apple: [
      { url: '/apple-touch-icon.png?v=2', sizes: '180x180', type: 'image/png' },
      { url: '/apple-touch-icon-precomposed.png?v=2', sizes: '180x180', type: 'image/png' },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Evolve',
  },
};

export const viewport: Viewport = {
  themeColor: '#070b14',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} dark`} suppressHydrationWarning>
      <head>
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=2" />
        <link rel="apple-touch-icon-precomposed" sizes="180x180" href="/apple-touch-icon.png?v=2" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png?v=2" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png?v=2" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png?v=2" />
        <link rel="icon" type="image/png" sizes="512x512" href="/icon-512.png?v=2" />
        <link rel="manifest" href="/manifest.json?v=2" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('bibo_user_theme');var g=localStorage.getItem('bibo_user_gender');if(!t){t=(g==='female')?'rose-aura':'midnight-pulse';}var m={'midnight-pulse':'theme-midnight','forest-gravity':'theme-forest','violet-dream':'theme-violet','rose-aura':'theme-rose'};var c=m[t]||'theme-midnight';document.documentElement.classList.add(c);document.documentElement.setAttribute('data-theme',t);if(t==='violet-dream'||t==='rose-aura'||g==='female'){document.documentElement.classList.add('theme-female');}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-screen bg-[#0f172a] font-sans text-slate-200 antialiased">
        <PwaRegister />
        <ThemeProvider>
          <AppSplashLoader />
          <NavigationProvider>
            <div className="flex h-screen overflow-hidden flex-col lg:flex-row">
              <Sidebar />
              <main className="flex-1 overflow-y-auto pb-20 lg:pb-0">
                <div className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
                  {children}
                </div>
              </main>
            </div>
            <MobileBottomNav />
          </NavigationProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
