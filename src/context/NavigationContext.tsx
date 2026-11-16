'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
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
}

const NavigationContext = createContext<NavigationContextType>({
  slots: DEFAULT_NAV_SLOTS,
  updateSlot: () => {},
  resetSlots: () => {},
});

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const [slots, setSlots] = useState<[string, string, string, string]>(DEFAULT_NAV_SLOTS);

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
  }, []);

  const updateSlot = (slotIndex: 0 | 1 | 2 | 3, itemId: string) => {
    if (!NAV_OPTIONS_MAP[itemId]) return;
    setSlots((prev) => {
      const updated: [string, string, string, string] = [...prev];
      updated[slotIndex] = itemId;
      try {
        localStorage.setItem('bibo_mobile_nav_slots', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const resetSlots = () => {
    setSlots(DEFAULT_NAV_SLOTS);
    try {
      localStorage.setItem('bibo_mobile_nav_slots', JSON.stringify(DEFAULT_NAV_SLOTS));
    } catch {}
  };

  return (
    <NavigationContext.Provider value={{ slots, updateSlot, resetSlots }}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  return useContext(NavigationContext);
}
