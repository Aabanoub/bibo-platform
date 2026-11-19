'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CheckSquare,
  Wallet,
  Activity,
  StickyNote,
  Plus,
  MessageSquare,
  TrendingUp,
  Zap,
  Flame,
  Award,
  QrCode,
  Sparkles,
  Settings as SettingsIcon,
} from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { useNavigation } from '@/context/NavigationContext';
import CountdownWidget from '@/components/CountdownWidget';
import type { Task, Transaction, Habit, HabitLog, Note } from '@/types';

interface DashboardData {
  openTasks: number;
  completedToday: number;
  netBalance: number;
  todaySpending: number;
  monthlySpending: number;
  totalIncome: number;
  totalExpenses: number;
  habitsCompletedToday: number;
  totalHabits: number;
  habitsLeftToday: number;
  totalNotes: number;
  recentlyUpdatedNotes: number;
}

const defaultData: DashboardData = {
  openTasks: 0,
  completedToday: 0,
  netBalance: 0,
  todaySpending: 0,
  monthlySpending: 0,
  totalIncome: 0,
  totalExpenses: 0,
  habitsCompletedToday: 0,
  totalHabits: 0,
  habitsLeftToday: 0,
  totalNotes: 0,
  recentlyUpdatedNotes: 0,
};

export default function DashboardPage() {
  const supabase = createClient();
  const { slots } = useNavigation();
  const [data, setData] = useState<DashboardData>(defaultData);
  const [userName, setUserName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDashboard() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        setUserName(
          user.user_metadata?.full_name ||
            user.user_metadata?.name ||
            user.email?.split('@')[0] ||
            'User'
        );

        const today = new Date();
        const todayDateStr = today.toISOString().split('T')[0];
        const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
        const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

        // Fetch all data in parallel
        const [
          tasksRes,
          completedTasksRes,
          transactionsRes,
          habitsRes,
          habitLogsRes,
          notesRes,
          recentNotesRes,
        ] = await Promise.all([
          supabase
            .from('tasks')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .neq('status', 'done'),
          supabase
            .from('tasks')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('status', 'done')
            .gte('updated_at', todayStart),
          supabase
            .from('transactions')
            .select('id, description, amount, type, date, created_at')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false }),
          supabase
            .from('habits')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id),
          supabase
            .from('habit_logs')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('completed_at', todayDateStr),
          supabase
            .from('notes')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id),
          supabase
            .from('notes')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .gte('updated_at', weekAgo),
        ]);

        // Calculate synchronized Net Balance and spending totals
        const allTransactions = (transactionsRes.data as any[]) || [];
        let totalIncome = 0;
        let totalExpenses = 0;
        let todaySpending = 0;
        let monthlySpending = 0;

        const currentMonthPrefix = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

        for (const t of allTransactions) {
          const amt = Math.abs(Number(t.amount)) || 0;
          const isIncome = t.type === 'income';
          const isExpense = t.type === 'expense';
          const txDate = t.date ? String(t.date).slice(0, 10) : '';

          if (isIncome) totalIncome += amt;
          if (isExpense) {
            totalExpenses += amt;
            if (txDate.startsWith(currentMonthPrefix)) {
              monthlySpending += amt;
            }
            if (txDate === todayDateStr) {
              todaySpending += amt;
            }
          }
        }

        const netBalance = totalIncome - totalExpenses;
        const habitsCompletedToday = habitLogsRes.count || 0;
        const totalHabits = habitsRes.count || 0;
        const habitsLeftToday = Math.max(0, totalHabits - habitsCompletedToday);

        setData({
          openTasks: tasksRes.count || 0,
          completedToday: completedTasksRes.count || 0,
          netBalance,
          totalIncome,
          totalExpenses,
          todaySpending,
          monthlySpending,
          habitsCompletedToday,
          totalHabits,
          habitsLeftToday,
          totalNotes: notesRes.count || 0,
          recentlyUpdatedNotes: recentNotesRes.count || 0,
        });
      } catch (err) {
        console.error('Dashboard fetch error:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchDashboard();
  }, []);

  function getGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }

  function formatDate(): string {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  const summaryCards = [
    {
      title: 'Tasks',
      icon: <CheckSquare size={22} />,
      value: data.openTasks,
      label: 'open tasks',
      sub: `${data.completedToday} completed today`,
      gradient: 'from-blue-500/20 to-blue-600/5',
      border: 'border-blue-500/20',
      iconColor: 'text-blue-400',
      href: '/tasks',
    },
    {
      title: 'Finance',
      icon: <Wallet size={22} />,
      value: `${data.netBalance >= 0 ? '+' : '-'}$${Math.abs(data.netBalance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      label: 'net balance',
      sub: `$${data.monthlySpending.toFixed(2)} spent this month`,
      gradient: 'from-emerald-500/20 to-emerald-600/5',
      border: 'border-emerald-500/20',
      iconColor: data.netBalance >= 0 ? 'text-emerald-400' : 'text-rose-400',
      href: '/finance',
    },
    {
      title: 'Habits',
      icon: <Activity size={22} />,
      value: data.habitsLeftToday,
      label: 'habits left today',
      sub:
        data.totalHabits > 0 && data.habitsLeftToday === 0
          ? `All ${data.totalHabits} completed today! 🎉`
          : `${data.habitsCompletedToday} of ${data.totalHabits} completed today`,
      gradient: 'from-purple-500/20 to-purple-600/5',
      border: 'border-purple-500/20',
      iconColor: data.totalHabits > 0 && data.habitsLeftToday === 0 ? 'text-emerald-400' : 'text-purple-400',
      href: '/habits',
    },
    {
      title: 'Notes',
      icon: <StickyNote size={22} />,
      value: data.totalNotes,
      label: 'total notes',
      sub: `${data.recentlyUpdatedNotes} updated recently`,
      gradient: 'from-amber-500/20 to-amber-600/5',
      border: 'border-amber-500/20',
      iconColor: 'text-amber-400',
      href: '/notes',
    },
  ];

  // Quick Actions definitions with navId to dynamically filter out items present in Mobile Bottom Nav
  const allQuickActions = [
    { navId: 'notes', label: 'New Note', icon: <StickyNote size={18} />, href: '/notes?new=true', color: 'text-amber-400' },
    { navId: 'tasks', label: 'Add Task', icon: <Plus size={18} />, href: '/tasks?new=true', color: 'text-blue-400' },
    { navId: 'finance', label: 'Log Expense', icon: <Wallet size={18} />, href: '/finance?new=true', color: 'text-emerald-400' },
    { navId: 'focus', label: 'Focus Mode', icon: <Flame size={18} />, href: '/focus', color: 'text-rose-400' },
    { navId: 'habits', label: 'Check Habits', icon: <Activity size={18} />, href: '/habits', color: 'text-purple-400' },
    { navId: 'qr', label: 'QR Studio', icon: <QrCode size={18} />, href: '/qr', color: 'text-cyan-400' },
    { navId: 'review', label: 'Life Review', icon: <Award size={18} />, href: '/review', color: 'text-purple-400' },
    { navId: 'chat', label: 'AI Assistant', icon: <MessageSquare size={18} />, href: '/chat', color: 'text-indigo-400' },
    { navId: 'settings', label: 'Settings', icon: <SettingsIcon size={18} />, href: '/settings', color: 'text-slate-400' },
  ];

  // Dynamic filter: if an action is already accessible in the user's Mobile Bottom Navigation Bar, remove it from dashboard Quick Actions
  const quickActions = allQuickActions.filter((action) => !slots.includes(action.navId));

  // Platform Apps & Tools definitions with navId to dynamically filter out items present in Mobile Bottom Nav
  const allPlatformTools = [
    {
      navId: 'chat',
      href: '/chat',
      title: 'AI Assistant',
      desc: 'Chat with your personal assistant powered by Gemini for insights & organization.',
      icon: <MessageSquare size={18} />,
      border: 'border-indigo-500/20 hover:border-indigo-500/40',
      gradient: 'from-indigo-950/40 to-slate-900',
      iconBg: 'bg-indigo-500/20 text-indigo-400',
    },
    {
      navId: 'focus',
      href: '/focus',
      title: 'Focus Mode',
      desc: 'Pomodoro deep work timer with customizable focus & break times and ambient rain sound.',
      icon: <Flame size={18} />,
      border: 'border-amber-500/20 hover:border-amber-500/40',
      gradient: 'from-amber-950/40 to-slate-900',
      iconBg: 'bg-amber-500/20 text-amber-400',
    },
    {
      navId: 'qr',
      href: '/qr',
      title: 'QR Code Studio',
      desc: 'Generate QR codes for URLs, Wi-Fi, vCard contacts, WhatsApp & Crypto.',
      icon: <QrCode size={18} />,
      border: 'border-cyan-500/20 hover:border-cyan-500/40',
      gradient: 'from-cyan-950/40 to-slate-900',
      iconBg: 'bg-cyan-500/20 text-cyan-400',
    },
    {
      navId: 'review',
      href: '/review',
      title: 'Sunday Life Review',
      desc: 'Weekly savings rate, task performance & downloadable AI PDF report with tables.',
      icon: <Award size={18} />,
      border: 'border-purple-500/20 hover:border-purple-500/40',
      gradient: 'from-purple-950/40 to-slate-900',
      iconBg: 'bg-purple-500/20 text-purple-400',
    },
  ];

  // Dynamic filter: if an app/tool is active in the Mobile Bottom Nav slots, remove it from dashboard Platform Apps & Tools
  const platformTools = allPlatformTools.filter((tool) => !slots.includes(tool.navId));

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-700 border-t-blue-500" />
          <p className="text-sm text-slate-500">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header / Greeting */}
      <header className="pt-2">
        <h1 className="text-2xl font-bold text-white sm:text-3xl">
          {getGreeting()},{' '}
          <span className="gradient-text">
            {userName}
          </span>
        </h1>
        <p className="mt-1 text-sm text-slate-400">{formatDate()}</p>
      </header>

      {/* Anchored Countdown Timer & Push Reminders */}
      <CountdownWidget />

      {/* Summary Cards */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {summaryCards.map((card) => (
          <Link
            key={card.title}
            href={card.href}
            className={`group relative overflow-hidden rounded-xl border ${card.border} bg-gradient-to-br ${card.gradient} p-5 transition-all duration-200 hover:scale-[1.02] hover:shadow-lg hover:shadow-black/20`}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
                  {card.title}
                </p>
                <p className="mt-2 text-2xl font-bold text-white">{card.value}</p>
                <p className="mt-0.5 text-sm text-slate-400">{card.label}</p>
              </div>
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-lg bg-slate-800/60 ${card.iconColor}`}
              >
                {card.icon}
              </div>
            </div>
            <p className="mt-3 flex items-center gap-1 text-xs text-slate-500">
              <TrendingUp size={12} />
              {card.sub}
            </p>
            <div className="absolute bottom-0 right-0 translate-x-4 translate-y-4 opacity-5">
              <div className={card.iconColor}>{card.icon}</div>
            </div>
          </Link>
        ))}
      </section>

      {/* Platform Apps & AI Suite (Filtered dynamically against Mobile Bottom Nav) */}
      {platformTools.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center justify-between text-sm font-semibold uppercase tracking-wider text-slate-400">
            <span className="flex items-center gap-2">
              <Sparkles size={15} className="text-blue-400" />
              Platform Apps & Tools
            </span>
          </h2>
          <div
            className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${
              platformTools.length >= 3 ? 'lg:grid-cols-3 xl:grid-cols-4' : 'lg:grid-cols-2'
            }`}
          >
            {platformTools.map((tool) => (
              <Link
                key={tool.title}
                href={tool.href}
                className={`group relative overflow-hidden rounded-2xl border ${tool.border} bg-gradient-to-br ${tool.gradient} p-4 transition hover:border-opacity-60 hover:scale-[1.01]`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${tool.iconBg}`}>
                    {tool.icon}
                  </div>
                  <h3 className="font-semibold text-white text-sm">{tool.title}</h3>
                </div>
                <p className="text-xs text-slate-400">{tool.desc}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Quick Actions (Filtered dynamically against Mobile Bottom Nav) */}
      {quickActions.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-400">
            <Zap size={14} className="text-yellow-400" />
            Quick Actions
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {quickActions.map((action) => (
              <Link
                key={action.label}
                href={action.href}
                className="group flex items-center gap-3 rounded-xl border border-slate-700/50 bg-slate-800/40 px-4 py-3.5 transition-all duration-200 hover:border-slate-600 hover:bg-slate-800/70"
              >
                <span className={`${action.color} transition-transform duration-200 group-hover:scale-110`}>
                  {action.icon}
                </span>
                <span className="text-sm font-medium text-slate-300 group-hover:text-white">
                  {action.label}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
