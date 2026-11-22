'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import {
  StickyNote,
  CheckSquare,
  Flame,
  Wallet,
  Activity,
  QrCode,
  Award,
  MessageSquare,
  Settings as SettingsIcon,
  Wand2,
  LucideIcon,
} from 'lucide-react';

export interface NavOption {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  description: string;
}

export const AVAILABLE_NAV_OPTIONS: NavOption[] = [
  { id: 'notes', label: 'Notes', href: '/notes', icon: StickyNote, description: 'Notes & documents' },
  { id: 'tasks', label: 'Tasks', href: '/tasks', icon: CheckSquare, description: 'Tasks & to-dos' },
  { id: 'finance', label: 'Finance', href: '/finance', icon: Wallet, description: 'Expenses & balance' },
  { id: 'focus', label: 'Focus Mode', href: '/focus', icon: Flame, description: 'Pomodoro timer' },
  { id: 'habits', label: 'Habits', href: '/habits', icon: Activity, description: 'Daily streaks' },
  { id: 'chat', label: 'AI Chat', href: '/chat', icon: MessageSquare, description: 'AI assistant' },
  { id: 'qr', label: 'QR Studio', href: '/qr', icon: QrCode, description: 'QR generator' },
  { id: 'enhance', label: 'Photo Enhancer', href: '/enhance', icon: Wand2, description: 'AI photo quality enhancer' },
  { id: 'review', label: 'Life Review', href: '/review', icon: Award, description: 'Weekly AI review' },
  { id: 'settings', label: 'Settings', href: '/settings', icon: SettingsIcon, description: 'Platform settings' },
];

export const NAV_OPTIONS_MAP: Record<string, NavOption> = Object.fromEntries(
  AVAILABLE_NAV_OPTIONS.map((opt) => [opt.id, opt])
);

export const DEFAULT_NAV_SLOTS: [string, string, string, string] = [
  'notes',
  'tasks',
  'finance',
  'chat',
];

interface NavigationContextType {
  slots: [string, string, string, string];
  updateSlot: (slotIndex: 0 | 1 | 2 | 3, itemId: string) => void;
  resetSlots: () => void;
  isStudyLockdownActive: boolean;
  setStudyLockdownActive: (active: boolean) => void;
}

const NavigationContext = createContext<NavigationContextType>({
  slots: DEFAULT_NAV_SLOTS,
  updateSlot: () => {},
  resetSlots: () => {},
  isStudyLockdownActive: false,
  setStudyLockdownActive: () => {},
});

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const [slots, setSlots] = useState<[string, string, string, string]>(DEFAULT_NAV_SLOTS);
  const [isStudyLockdownActive, setStudyLockdownActive] = useState<boolean>(false);
  const supabase = createClient();

  // Listen for study lockdown changes dispatched globally
  useEffect(() => {
    const handleLockdownEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ active: boolean }>;
      if (typeof customEvent.detail?.active === 'boolean') {
        setStudyLockdownActive(customEvent.detail.active);
      }
    };

    window.addEventListener('study_lockdown_change', handleLockdownEvent);
    return () => {
      window.removeEventListener('study_lockdown_change', handleLockdownEvent);
    };
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('bibo_mobile_nav_slots');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (
          Array.isArray(parsed) &&
          parsed.length === 4 &&
          parsed.every((id) => NAV_OPTIONS_MAP[id])
        ) {
          setSlots([parsed[0], parsed[1], parsed[2], parsed[3]]);
        }
      }
    } catch (e) {
      console.warn('Could not load mobile nav slots:', e);
    }

    async function syncNavSlots() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('nav_slots')
            .eq('id', user.id)
            .maybeSingle();

          if (profile?.nav_slots && Array.isArray(profile.nav_slots) && profile.nav_slots.length === 4) {
            if (profile.nav_slots.every((id: string) => NAV_OPTIONS_MAP[id])) {
              const remoteSlots: [string, string, string, string] = [
                profile.nav_slots[0],
                profile.nav_slots[1],
                profile.nav_slots[2],
                profile.nav_slots[3],
              ];
              setSlots(remoteSlots);
              localStorage.setItem('bibo_mobile_nav_slots', JSON.stringify(remoteSlots));
            }
          }
        }
      } catch (err) {
        console.warn('Could not sync nav slots from database:', err);
      }
    }

    syncNavSlots();
  }, [supabase]);

  const updateSlot = async (slotIndex: 0 | 1 | 2 | 3, itemId: string) => {
    if (!NAV_OPTIONS_MAP[itemId]) return;
    const updated: [string, string, string, string] = [...slots];
    updated[slotIndex] = itemId;
    setSlots(updated);

    try {
      localStorage.setItem('bibo_mobile_nav_slots', JSON.stringify(updated));
    } catch {}

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('profiles').upsert(
          {
            id: user.id,
            nav_slots: updated,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        );
      }
    } catch (err) {
      console.warn('Failed to persist nav slots to database:', err);
    }
  };

  const resetSlots = async () => {
    setSlots(DEFAULT_NAV_SLOTS);
    try {
      localStorage.setItem('bibo_mobile_nav_slots', JSON.stringify(DEFAULT_NAV_SLOTS));
    } catch {}

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('profiles').upsert(
          {
            id: user.id,
            nav_slots: DEFAULT_NAV_SLOTS,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        );
      }
    } catch (err) {
      console.warn('Failed to reset nav slots in database:', err);
    }
  };

  return (
    <NavigationContext.Provider
      value={{
        slots,
        updateSlot,
        resetSlots,
        isStudyLockdownActive,
        setStudyLockdownActive,
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  return useContext(NavigationContext);
}
