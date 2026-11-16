'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, StickyNote, CheckSquare, Calendar, MessageSquare } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';

export default function MobileBottomNav() {
  const pathname = usePathname();
  const { isGirly } = useTheme();

  if (pathname === '/login') return null;

  const items = [
    { label: 'Home', href: '/', icon: LayoutDashboard },
    { label: 'Notes', href: '/notes', icon: StickyNote },
    { label: 'Tasks', href: '/tasks', icon: CheckSquare },
    { label: 'Calendar', href: '/calendar', icon: Calendar },
    { label: 'AI Chat', href: '/chat', icon: MessageSquare },
  ];

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 flex h-16 items-center justify-around border-t border-slate-800 bg-slate-900/95 px-2 backdrop-blur-lg lg:hidden">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href;
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
