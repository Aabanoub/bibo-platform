'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell,
  Check,
  CheckCheck,
  Trash2,
  Sparkles,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
  Volume2,
} from 'lucide-react';
import { createClient } from '@/lib/supabase';
import { requestNotificationPermission } from '@/lib/notifications';
import type { Notification } from '@/types';

interface NotificationBellProps {
  collapsed?: boolean;
  placement?: 'top' | 'sidebar' | 'auto';
}

export default function NotificationBell({
  collapsed = false,
  placement = 'sidebar',
}: NotificationBellProps) {
  const router = useRouter();
  const supabase = createClient();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id);

      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(30);

      if (error) {
        console.error('Error fetching notifications:', error);
        return;
      }

      if (data) {
        setNotifications(data as Notification[]);
        setUnreadCount(data.filter((n: Notification) => !n.is_read).length);
      }
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchNotifications();

    let channel: any;

    async function setupRealtime() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Filter Realtime strictly to the authenticated user's ID
      channel = supabase
        .channel(`notifications-user-${user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`,
          },
          (payload: any) => {
            const newNotification = payload.new as Notification;
            setNotifications((prev) => {
              // Deduplicate if already present in state
              if (prev.some((n) => n.id === newNotification.id)) return prev;
              return [newNotification, ...prev].slice(0, 30);
            });
            if (!newNotification.is_read) {
              setUnreadCount((prev) => prev + 1);
            }
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`,
          },
          (payload: any) => {
            const updated = payload.new as Notification;
            setNotifications((prev) =>
              prev.map((n) => (n.id === updated.id ? updated : n))
            );
            setUnreadCount((prev) => {
              const oldItem = notifications.find((n) => n.id === updated.id);
              if (oldItem && !oldItem.is_read && updated.is_read) return Math.max(0, prev - 1);
              return prev;
            });
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${user.id}`,
          },
          (payload: any) => {
            const deletedId = payload.old?.id;
            if (deletedId) {
              setNotifications((prev) => prev.filter((n) => n.id !== deletedId));
            }
          }
        )
        .subscribe();
    }

    setupRealtime();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [fetchNotifications, supabase]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent | TouchEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  async function markAsRead(notificationId: string) {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId);

    if (!error) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }
  }

  async function markAllAsRead() {
    if (!currentUserId) return;

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', currentUserId)
      .eq('is_read', false);

    if (!error) {
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    }
  }

  async function deleteNotification(e: React.MouseEvent, notificationId: string) {
    e.stopPropagation();
    const target = notifications.find((n) => n.id === notificationId);
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', notificationId);

    if (!error) {
      setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
      if (target && !target.is_read) {
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    }
  }

  async function clearAllNotifications() {
    if (!currentUserId || notifications.length === 0) return;
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('user_id', currentUserId);

    if (!error) {
      setNotifications([]);
      setUnreadCount(0);
    }
  }

  async function handleEnablePush() {
    await requestNotificationPermission(currentUserId || undefined);
  }

  function renderTypeIcon(type?: string | null) {
    switch (type) {
      case 'ai':
        return <Sparkles size={14} className="text-purple-400" />;
      case 'reminder':
        return <Clock size={14} className="text-amber-400" />;
      case 'success':
        return <CheckCircle2 size={14} className="text-emerald-400" />;
      case 'warning':
      case 'error':
        return <AlertTriangle size={14} className="text-rose-400" />;
      default:
        return <Info size={14} className="text-blue-400" />;
    }
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
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  }

  return (
    <div ref={dropdownRef} className="relative">
      {/* Bell Button */}
      <button
        type="button"
        onClick={() => {
          if (!open) {
            fetchNotifications();
          }
          setOpen(!open);
        }}
        className={`relative flex items-center transition-all duration-150 text-slate-400 hover:text-slate-200 active:scale-95 ${
          collapsed
            ? 'h-9 w-9 justify-center rounded-lg bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white border border-slate-700/50 shadow-sm'
            : 'w-full gap-2 px-3 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-800'
        }`}
        title="Notifications"
        aria-label="View notifications"
      >
        <Bell size={collapsed ? 18 : 20} className="flex-shrink-0" />
        {!collapsed && <span>Notifications</span>}
        {unreadCount > 0 && (
          <span
            className={`absolute flex items-center justify-center rounded-full bg-red-500 font-bold text-white shadow-lg shadow-red-500/40 animate-pulse ${
              collapsed
                ? '-top-1 -right-1 h-4 min-w-[16px] px-1 text-[9px]'
                : 'right-2 top-2.5 h-5 min-w-[20px] px-1 text-[10px]'
            }`}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Backdrop for outside tap/click & dimming */}
      {open && (
        <div
          className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-[2px] transition-opacity animate-in fade-in duration-150"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Dropdown Notification Center */}
      {open && (
        <div
          className={`notification-dropdown ${
            placement === 'top'
              ? 'fixed top-14 inset-x-3 sm:inset-x-auto sm:absolute sm:top-full sm:right-0 sm:mt-2 sm:w-96 sm:max-w-sm rounded-2xl border border-slate-700/80 bg-[#060913] shadow-2xl shadow-black z-[70] overflow-hidden flex flex-col max-h-[calc(100dvh-5.5rem)] animate-in fade-in slide-in-from-top-2 duration-150'
              : 'absolute bottom-full left-0 mb-2 w-80 sm:w-96 rounded-2xl border border-slate-700/80 bg-[#060913] shadow-2xl shadow-black lg:bottom-0 lg:left-full lg:top-auto lg:mb-0 lg:ml-2 z-[70] overflow-hidden flex flex-col max-h-[calc(100vh-6rem)] animate-in fade-in duration-150'
          }`}
          style={{ backgroundColor: '#060913' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800/80 px-4 py-3 bg-[#03060c] shrink-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-white">Notifications</h3>
              {unreadCount > 0 && (
                <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[10px] font-bold text-blue-300">
                  {unreadCount} new
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleEnablePush}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-800/80 hover:text-white"
                title="Enable / Refresh Push Permission"
              >
                <Volume2 size={14} />
              </button>

              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllAsRead}
                  className="flex h-7 items-center gap-1 rounded-lg px-2 text-xs text-slate-400 transition hover:bg-slate-800/80 hover:text-white"
                  title="Mark all as read"
                >
                  <CheckCheck size={14} />
                  <span>Read all</span>
                </button>
              )}

              {notifications.length > 0 && (
                <button
                  type="button"
                  onClick={clearAllNotifications}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition hover:bg-red-500/20 hover:text-red-400"
                  title="Clear all notifications"
                >
                  <Trash2 size={13} />
                </button>
              )}

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-800/80 hover:text-white ml-0.5"
                title="Close notifications"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Notification Items List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60 overscroll-contain bg-[#060913]">
            {loading && notifications.length === 0 ? (
              <div className="flex items-center justify-center py-10 text-xs text-slate-500">
                Loading updates...
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-500 space-y-2">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-800/50 text-slate-600">
                  <Bell size={24} />
                </div>
                <p className="text-xs font-medium">All caught up!</p>
                <p className="text-[11px] text-slate-600">No new notifications at this time.</p>
              </div>
            ) : (
              notifications.map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    if (!item.is_read) markAsRead(item.id);
                    if (item.action_url) {
                      setOpen(false);
                      router.push(item.action_url);
                    }
                  }}
                  className={`group flex items-start gap-3 p-3.5 text-left transition-colors cursor-pointer hover:bg-slate-800/80 ${
                    !item.is_read ? 'bg-blue-950/40 border-l-2 border-l-blue-500' : 'bg-[#060913]'
                  }`}
                >
                  {/* Category Indicator Icon */}
                  <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-slate-900 border border-slate-800">
                    {renderTypeIcon(item.type)}
                  </div>

                  {/* Notification Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <p
                        className={`text-xs leading-snug truncate ${
                          !item.is_read ? 'font-semibold text-white' : 'text-slate-300 font-normal'
                        }`}
                      >
                        {item.title}
                      </p>
                      <span className="text-[10px] text-slate-500 shrink-0">
                        {timeAgo(item.created_at)}
                      </span>
                    </div>

                    {item.message && (
                      <p className="mt-0.5 text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                        {item.message}
                      </p>
                    )}
                  </div>

                  {/* Actions: Delete single item */}
                  <button
                    type="button"
                    onClick={(e) => deleteNotification(e, item.id)}
                    className="opacity-70 sm:opacity-0 sm:group-hover:opacity-100 flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 active:scale-90 transition shrink-0"
                    title="Delete notification"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
