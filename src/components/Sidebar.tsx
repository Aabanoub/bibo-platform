'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  StickyNote,
  CheckSquare,
  Wallet,
  Activity,
  MessageSquare,
  Menu,
  X,
  LogOut,
  ChevronLeft,
  Sparkles,
  Calendar,
  Flame,
  Award,
  QrCode,
  Settings,
} from 'lucide-react';
import { createClient } from '@/lib/supabase';
import NotificationBell from '@/components/NotificationBell';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/', icon: <LayoutDashboard size={20} /> },
  { label: 'Notes', href: '/notes', icon: <StickyNote size={20} /> },
  { label: 'Tasks', href: '/tasks', icon: <CheckSquare size={20} /> },
  { label: 'Calendar', href: '/calendar', icon: <Calendar size={20} /> },
  { label: 'Focus Mode', href: '/focus', icon: <Flame size={20} /> },
  { label: 'Finance', href: '/finance', icon: <Wallet size={20} /> },
  { label: 'Habits', href: '/habits', icon: <Activity size={20} /> },
  { label: 'QR Studio', href: '/qr', icon: <QrCode size={20} /> },
  { label: 'Weekly Review', href: '/review', icon: <Award size={20} /> },
  { label: 'AI Chat', href: '/chat', icon: <MessageSquare size={20} /> },
  { label: 'Settings', href: '/settings', icon: <Settings size={20} /> },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState<{ email?: string; name?: string; avatar?: string } | null>(null);

  useEffect(() => {
    async function getUser() {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (authUser) {
        setUser({
          email: authUser.email,
          name:
            authUser.user_metadata?.full_name ||
            authUser.user_metadata?.name ||
            authUser.email?.split('@')[0] ||
            'User',
          avatar: authUser.user_metadata?.avatar_url,
        });
      }
    }
    getUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: any, session: any) => {
      if (session?.user) {
        setUser({
          email: session.user.email,
          name:
            session.user.user_metadata?.full_name ||
            session.user.user_metadata?.name ||
            session.user.email?.split('@')[0] ||
            'User',
          avatar: session.user.user_metadata?.avatar_url,
        });
      } else {
        setUser(null);
      }
    });

    return () => {
      subscription?.unsubscribe?.();
    };
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const isLoginPage = pathname === '/login';
  if (isLoginPage) return null;

  const sidebarContent = (
    <div className="flex h-full flex-col bg-slate-900 border-r border-slate-800">
      {/* Header */}
      <div className="flex h-16 items-center justify-between px-4 border-b border-slate-800">
        {!collapsed && (
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500">
              <Sparkles size={18} className="text-white" />
            </div>
            <span className="text-lg font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
              AbanoubApp
            </span>
          </Link>
        )}
        {collapsed && (
          <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500">
            <Sparkles size={18} className="text-white" />
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          aria-label="Toggle sidebar"
        >
          <ChevronLeft
            size={16}
            className={`transition-transform duration-200 ${collapsed ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-blue-600/15 text-blue-400 shadow-sm shadow-blue-500/5'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
              title={collapsed ? item.label : undefined}
            >
              <span
                className={`flex-shrink-0 ${
                  isActive ? 'text-blue-400' : 'text-slate-500 group-hover:text-slate-300'
                }`}
              >
                {item.icon}
              </span>
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Notification bell (above user section) */}
      <div className={`px-3 pb-2 ${collapsed ? 'flex justify-center' : ''}`}>
        <NotificationBell collapsed={collapsed} />
      </div>

      {/* User Section */}
      <div className="border-t border-slate-800 p-3">
        {user ? (
          <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'}`}>
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-sm font-semibold text-white uppercase">
              {user.avatar ? (
                <img
                  src={user.avatar}
                  alt="Avatar"
                  className="h-9 w-9 rounded-full object-cover"
                />
              ) : (
                user.name?.charAt(0) || 'U'
              )}
            </div>
            {!collapsed && (
              <Link href="/settings" className="flex-1 min-w-0 hover:opacity-85 transition">
                <p className="truncate text-sm font-medium text-slate-200">{user.name}</p>
                <p className="truncate text-xs text-slate-500">{user.email}</p>
              </Link>
            )}
            {!collapsed && (
              <div className="flex items-center gap-1">
                <Link
                  href="/settings"
                  className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300"
                  title="Settings & Reset Data"
                >
                  <Settings size={15} />
                </Link>
                <button
                  onClick={handleSignOut}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
                  title="Sign Out"
                >
                  <LogOut size={15} />
                </button>
              </div>
            )}
          </div>
        ) : (
          <Link
            href="/login"
            className="btn-primary w-full text-center text-sm"
          >
            {collapsed ? <LogOut size={16} /> : 'Sign In'}
          </Link>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile top header bar */}
      <header className="lg:hidden h-14 bg-slate-900/95 border-b border-slate-800 backdrop-blur-md px-3 sm:px-4 flex items-center justify-between shrink-0 z-30 sticky top-0 w-full">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setMobileOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition shadow-sm active:scale-95"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 text-white shadow-sm">
              <Sparkles size={14} />
            </div>
            <span className="font-bold text-sm bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
              AbanoubApp
            </span>
          </Link>
        </div>

        <div className="flex items-center gap-1.5">
          <NotificationBell collapsed={true} />
          <Link
            href="/settings"
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800/80 text-slate-400 hover:bg-slate-800 hover:text-white transition active:scale-95"
            aria-label="Settings"
          >
            <Settings size={16} />
          </Link>
        </div>
      </header>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 max-w-[80vw] transform transition-transform duration-300 ease-in-out lg:hidden shadow-2xl ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute right-3 top-4 flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-white"
          aria-label="Close menu"
        >
          <X size={18} />
        </button>
        {sidebarContent}
      </aside>

      {/* Desktop sidebar */}
      <aside
        className={`hidden lg:block flex-shrink-0 transition-all duration-300 ${
          collapsed ? 'w-[72px]' : 'w-64'
        }`}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
