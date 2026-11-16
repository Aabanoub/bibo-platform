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
  Clock,
  Zap,
  ArrowRight,
  Calendar,
  Flame,
  Award,
  QrCode,
} from 'lucide-react';
import { createClient } from '@/lib/supabase';
import type { Task, Transaction, Habit, HabitLog, Note } from '@/types';

interface DashboardData {
  openTasks: number;
  completedToday: number;
  todaySpending: number;
  monthlySpending: number;
  habitsCompletedToday: number;
  totalHabits: number;
  totalNotes: number;
  recentlyUpdatedNotes: number;
  recentActivity: ActivityItem[];
}

interface ActivityItem {
  id: string;
  type: 'task' | 'note' | 'finance' | 'habit';
  title: string;
  description: string;
  timestamp: string;
}

const defaultData: DashboardData = {
  openTasks: 0,
  completedToday: 0,
  todaySpending: 0,
  monthlySpending: 0,
  habitsCompletedToday: 0,
  totalHabits: 0,
  totalNotes: 0,
  recentlyUpdatedNotes: 0,
  recentActivity: [],
};

export default function DashboardPage() {
  const supabase = createClient();
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
          todaySpendingRes,
          monthlySpendingRes,
          habitsRes,
          habitLogsRes,
          notesRes,
          recentNotesRes,
          recentTasksRes,
          recentTransactionsRes,
          recentHabitLogsRes,
        ] = await Promise.all([
          // Open tasks
          supabase
            .from('tasks')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .neq('status', 'done'),
          // Completed today
          supabase
            .from('tasks')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('status', 'done')
            .gte('updated_at', todayStart),
          // Today spending
          supabase
            .from('transactions')
            .select('amount')
            .eq('user_id', user.id)
            .eq('type', 'expense')
            .gte('created_at', todayStart),
          // Monthly spending
          supabase
            .from('transactions')
            .select('amount')
            .eq('user_id', user.id)
            .eq('type', 'expense')
            .gte('created_at', monthStart),
          // Total habits
          supabase
            .from('habits')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id),
          // Habits completed today
          supabase
            .from('habit_logs')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('completed_at', todayDateStr),
          // Total notes
          supabase
            .from('notes')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id),
          // Recently updated notes (last 7 days)
          supabase
            .from('notes')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .gte('updated_at', weekAgo),
          // Recent tasks for activity feed
          supabase
            .from('tasks')
            .select('id, title, updated_at')
            .eq('user_id', user.id)
            .order('updated_at', { ascending: false })
            .limit(5),
          // Recent transactions
          supabase
            .from('transactions')
            .select('id, description, amount, type, created_at')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(5),
          // Recent habit logs
          supabase
            .from('habit_logs')
            .select('id, habit_id, completed_at')
            .eq('user_id', user.id)
            .order('completed_at', { ascending: false })
            .limit(5),
        ]);

        // Calculate spending totals
        const todaySpending =
          (todaySpendingRes.data as any[])?.reduce((sum: number, t: any) => sum + Math.abs(t.amount), 0) || 0;
        const monthlySpending =
          (monthlySpendingRes.data as any[])?.reduce((sum: number, t: any) => sum + Math.abs(t.amount), 0) || 0;

        // Build activity feed
        const activities: ActivityItem[] = [];

        (recentTasksRes.data as any[])?.forEach((task: any) => {
          activities.push({
            id: `task-${task.id}`,
            type: 'task',
            title: task.title,
            description: 'Task updated',
            timestamp: task.updated_at,
          });
        });

        (recentTransactionsRes.data as any[])?.forEach((tx: any) => {
          activities.push({
            id: `tx-${tx.id}`,
            type: 'finance',
            title: tx.description || `${tx.type === 'expense' ? 'Expense' : 'Income'}`,
            description: `$${Math.abs(tx.amount).toFixed(2)} ${tx.type}`,
            timestamp: tx.created_at,
          });
        });

        (recentHabitLogsRes.data as any[])?.forEach((log: any) => {
          activities.push({
            id: `habit-${log.id}`,
            type: 'habit',
            title: log.habits?.name || 'Habit Check-in',
            description: 'Habit completed',
            timestamp: log.completed_at || log.created_at || new Date().toISOString(),
          });
        });

        // Sort by time and take the 5 most recent
        activities.sort(
          (a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime()
        );

        setData({
          openTasks: tasksRes.count || 0,
          completedToday: completedTasksRes.count || 0,
          todaySpending,
          monthlySpending,
          habitsCompletedToday: habitLogsRes.count || 0,
          totalHabits: habitsRes.count || 0,
          totalNotes: notesRes.count || 0,
          recentlyUpdatedNotes: recentNotesRes.count || 0,
          recentActivity: activities.slice(0, 5),
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

  function timeAgo(dateString: string): string {
    const now = new Date();
    const date = new Date(dateString);
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  const activityIcon = (type: string) => {
    switch (type) {
      case 'task':
        return <CheckSquare size={16} className="text-blue-400" />;
      case 'finance':
        return <Wallet size={16} className="text-emerald-400" />;
      case 'habit':
        return <Activity size={16} className="text-purple-400" />;
      case 'note':
        return <StickyNote size={16} className="text-amber-400" />;
      default:
        return <Clock size={16} className="text-slate-400" />;
    }
  };

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
      value: `$${data.todaySpending.toFixed(2)}`,
      label: 'today',
      sub: `$${data.monthlySpending.toFixed(2)} this month`,
      gradient: 'from-emerald-500/20 to-emerald-600/5',
      border: 'border-emerald-500/20',
      iconColor: 'text-emerald-400',
      href: '/finance',
    },
    {
      title: 'Habits',
      icon: <Activity size={22} />,
      value: data.habitsCompletedToday,
      label: 'completed today',
      sub: `${data.totalHabits} total habits`,
      gradient: 'from-purple-500/20 to-purple-600/5',
      border: 'border-purple-500/20',
      iconColor: 'text-purple-400',
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

  const quickActions = [
    { label: 'New Note', icon: <StickyNote size={18} />, href: '/notes?new=true', color: 'text-amber-400' },
    { label: 'Add Task', icon: <Plus size={18} />, href: '/tasks?new=true', color: 'text-blue-400' },
    { label: 'Calendar', icon: <Calendar size={18} />, href: '/calendar', color: 'text-indigo-400' },
    { label: 'Focus Mode', icon: <Flame size={18} />, href: '/focus', color: 'text-rose-400' },
    { label: 'QR Studio', icon: <QrCode size={18} />, href: '/qr', color: 'text-cyan-400' },
    { label: 'Log Expense', icon: <Wallet size={18} />, href: '/finance?new=true', color: 'text-emerald-400' },
    { label: 'Life Review', icon: <Award size={18} />, href: '/review', color: 'text-purple-400' },
  ];

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
          <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
            {userName}
          </span>
        </h1>
        <p className="mt-1 text-sm text-slate-400">{formatDate()}</p>
      </header>

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

      {/* Quick Actions */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-400">
          <Zap size={14} className="text-yellow-400" />
          Quick Actions
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
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

      {/* Recent Activity */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-400">
          <Clock size={14} />
          Recent Activity
        </h2>
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 overflow-hidden">
          {data.recentActivity.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
              <Clock size={32} className="mb-3 opacity-30" />
              <p className="text-sm">No recent activity</p>
              <p className="mt-1 text-xs text-slate-600">
                Start by creating a note, task, or logging an expense
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-700/40">
              {data.recentActivity.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-700/20"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800">
                    {activityIcon(item.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium text-slate-200">{item.title}</p>
                    <p className="text-xs text-slate-500">{item.description}</p>
                  </div>
                  <span className="flex-shrink-0 text-xs text-slate-600">
                    {timeAgo(item.timestamp)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {data.recentActivity.length > 0 && (
            <div className="border-t border-slate-700/40 px-4 py-2.5">
              <Link
                href="/tasks"
                className="flex items-center gap-1 text-xs font-medium text-slate-500 transition-colors hover:text-blue-400"
              >
                View all activity
                <ArrowRight size={12} />
              </Link>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
