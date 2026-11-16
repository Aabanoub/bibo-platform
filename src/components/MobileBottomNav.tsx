'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { useNavigation, NAV_OPTIONS_MAP } from '@/context/NavigationContext';

export default function MobileBottomNav() {
  const pathname = usePathname();
  const { isGirly } = useTheme();
  const { slots } = useNavigation();

  if (pathname === '/login' || pathname === '/maintenance') return null;

  const opt1 = NAV_OPTIONS_MAP[slots[0]] || NAV_OPTIONS_MAP.notes;
  const opt2 = NAV_OPTIONS_MAP[slots[1]] || NAV_OPTIONS_MAP.tasks;
  const opt3 = NAV_OPTIONS_MAP[slots[2]] || NAV_OPTIONS_MAP.finance;
  const opt4 = NAV_OPTIONS_MAP[slots[3]] || NAV_OPTIONS_MAP.chat;

  const items = [
    { label: opt1.label, href: opt1.href, icon: opt1.icon, isCenter: false },
    { label: opt2.label, href: opt2.href, icon: opt2.icon, isCenter: false },
    { label: 'Home', href: '/', icon: Home, isCenter: true },
    { label: opt3.label, href: opt3.href, icon: opt3.icon, isCenter: false },
    { label: opt4.label, href: opt4.href, icon: opt4.icon, isCenter: false },
  ];

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 flex h-16 items-center justify-around border-t border-slate-800 bg-slate-900/95 px-2 backdrop-blur-lg lg:hidden">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href;

        // Centered Elevated Home Button
        if (item.isCenter) {
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center justify-center -mt-5 transition group active:scale-95"
            >
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-all duration-200 ring-4 ring-slate-900 ${
                  isActive
                    ? isGirly
                      ? 'bg-gradient-to-tr from-pink-600 to-rose-500 text-white shadow-pink-500/35 scale-105'
                      : 'bg-gradient-to-tr from-blue-600 to-cyan-500 text-white shadow-blue-500/35 scale-105'
                    : isGirly
                    ? 'bg-slate-800 text-pink-300 hover:bg-slate-700'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <Icon size={22} className={isActive ? 'text-white' : ''} />
              </div>
              <span
                className={`mt-0.5 text-[10px] font-medium transition ${
                  isActive
                    ? isGirly
                      ? 'text-pink-400 font-bold'
                      : 'text-blue-400 font-bold'
                    : 'text-slate-400 group-hover:text-slate-200'
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        }

        // Side items (Notes, Tasks, Finance, AI Chat)
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center justify-center gap-1 py-1 px-3 text-[11px] font-medium transition ${
              isActive
                ? isGirly
                  ? 'text-pink-400 font-semibold scale-105'
                  : 'text-blue-400 font-semibold scale-105'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Icon
              size={19}
              className={
                isActive
                  ? isGirly
                    ? 'text-pink-400'
                    : 'text-blue-400'
                  : 'text-slate-400'
              }
            />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
