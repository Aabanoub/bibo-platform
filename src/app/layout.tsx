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
  manifest: '/manifest.json',
  icons: {
    icon: '/logo.png',
    shortcut: '/logo.png',
    apple: '/logo.png',
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
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var g=localStorage.getItem('bibo_user_gender');if(g==='female'){document.documentElement.classList.add('theme-female');document.documentElement.setAttribute('data-theme','female');}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-screen bg-[#0f172a] font-sans text-slate-200 antialiased">
        <PwaRegister />
        <AppSplashLoader />
        <ThemeProvider>
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
