'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';

export type ThemeId = 'midnight-pulse' | 'forest-gravity' | 'violet-dream' | 'rose-aura' | 'ios-glass';
export type GenderCategory = 'male' | 'female';
export type GenderTheme = 'female' | 'male' | 'default';

export interface ThemeColors {
  background: string;
  secondaryBg: string;
  primaryAccent: string;
  secondaryAccent: string;
  text: string;
}

export interface ThemeConfig {
  id: ThemeId;
  name: string;
  category: GenderCategory;
  categoryLabel: string;
  subtitle: string;
  style: string;
  colors: ThemeColors;
  gradient: string;
  accentGradient: string;
  badgeBg: string;
  badgeText: string;
  borderColor: string;
}

export const THEMES: Record<ThemeId, ThemeConfig> = {
  'midnight-pulse': {
    id: 'midnight-pulse',
    name: 'Midnight Pulse',
    category: 'male',
    categoryLabel: '⚡ Male',
    subtitle: 'Futuristic, bold & technological',
    style: 'Electric Blue & Cyan',
    colors: {
      background: '#080E1C',
      secondaryBg: '#14213A',
      primaryAccent: '#2563EB',
      secondaryAccent: '#06B6D4',
      text: '#EAF2FF',
    },
    gradient: 'from-[#080E1C] via-[#14213A] to-[#1e345e]',
    accentGradient: 'from-[#2563EB] to-[#06B6D4]',
    badgeBg: 'bg-blue-500/20',
    badgeText: 'text-blue-300',
    borderColor: 'border-blue-500/40',
  },
  'forest-gravity': {
    id: 'forest-gravity',
    name: 'Forest Gravity',
    category: 'male',
    categoryLabel: '⚡ Male',
    subtitle: 'Natural, sophisticated & confident',
    style: 'Emerald Green & Cyber Lime',
    colors: {
      background: '#09140F',
      secondaryBg: '#15291E',
      primaryAccent: '#16A36A',
      secondaryAccent: '#A3E635',
      text: '#F4F7E9',
    },
    gradient: 'from-[#09140F] via-[#15291E] to-[#1e442f]',
    accentGradient: 'from-[#16A36A] to-[#A3E635]',
    badgeBg: 'bg-emerald-500/20',
    badgeText: 'text-emerald-300',
    borderColor: 'border-emerald-500/40',
  },
  'violet-dream': {
    id: 'violet-dream',
    name: 'Violet Dream',
    category: 'female',
    categoryLabel: '🌸 Female',
    subtitle: 'Creative, vibrant & elegant',
    style: 'Deep Violet & Neon Magenta',
    colors: {
      background: '#130D20',
      secondaryBg: '#281637',
      primaryAccent: '#9333EA',
      secondaryAccent: '#EC4899',
      text: '#F8EFFF',
    },
    gradient: 'from-[#130D20] via-[#281637] to-[#401c59]',
    accentGradient: 'from-[#9333EA] to-[#EC4899]',
    badgeBg: 'bg-purple-500/20',
    badgeText: 'text-purple-300',
    borderColor: 'border-purple-500/40',
  },
  'rose-aura': {
    id: 'rose-aura',
    name: 'Rose Aura',
    category: 'female',
    categoryLabel: '🌸 Female',
    subtitle: 'Warm, elegant & soft luxury',
    style: 'Rose Crimson & Soft Peach',
    colors: {
      background: '#190D16',
      secondaryBg: '#321725',
      primaryAccent: '#E84A75',
      secondaryAccent: '#FB9A8D',
      text: '#FFF0E9',
    },
    gradient: 'from-[#190D16] via-[#321725] to-[#4c1d37]',
    accentGradient: 'from-[#E84A75] to-[#FB9A8D]',
    badgeBg: 'bg-rose-500/20',
    badgeText: 'text-rose-300',
    borderColor: 'border-rose-500/40',
  },
  'ios-glass': {
    id: 'ios-glass',
    name: 'Glass UI',
    category: 'male',
    categoryLabel: '💎 Glass UI',
    subtitle: 'Apple frosted glass, specular highlights & dynamic glow',
    style: 'iOS Translucent Glass & Liquid Blue',
    colors: {
      background: '#070b16',
      secondaryBg: 'rgba(255, 255, 255, 0.08)',
      primaryAccent: '#0A84FF',
      secondaryAccent: '#5E5CE6',
      text: '#F5F5F7',
    },
    gradient: 'from-[#070b16] via-[#0d1629] to-[#121f3a]',
    accentGradient: 'from-[#0A84FF] via-[#5E5CE6] to-[#64D2FF]',
    badgeBg: 'bg-blue-500/25',
    badgeText: 'text-sky-300',
    borderColor: 'border-white/20',
  },
};

interface ThemeContextType {
  gender: GenderTheme;
  setGender: (gender: GenderTheme) => Promise<void>;
  theme: ThemeId;
  setTheme: (theme: ThemeId) => Promise<void>;
  isGirly: boolean;
  activeThemeConfig: ThemeConfig;
}

const ThemeContext = createContext<ThemeContextType>({
  gender: 'default',
  setGender: async () => {},
  theme: 'ios-glass',
  setTheme: async () => {},
  isGirly: false,
  activeThemeConfig: THEMES['ios-glass'],
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>('ios-glass');
  const [gender, setGenderState] = useState<GenderTheme>('default');
  const supabase = createClient();

  // Apply CSS classes to document root
  const applyThemeClass = (targetTheme: ThemeId, targetGender: GenderTheme) => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;

    // Clean any previous theme classes
    root.classList.remove('theme-midnight', 'theme-forest', 'theme-violet', 'theme-rose', 'theme-female', 'theme-glass');

    const classMap: Record<ThemeId, string> = {
      'midnight-pulse': 'theme-midnight',
      'forest-gravity': 'theme-forest',
      'violet-dream': 'theme-violet',
      'rose-aura': 'theme-rose',
      'ios-glass': 'theme-glass',
    };

    const targetClass = classMap[targetTheme] || 'theme-glass';
    root.classList.add(targetClass);
    root.setAttribute('data-theme', targetTheme);

    // Keep theme-female active for warm/girl themes for deep backward compatibility
    const isGirl = targetTheme === 'violet-dream' || targetTheme === 'rose-aura' || targetGender === 'female';
    if (isGirl) {
      root.classList.add('theme-female');
    }
  };

  useEffect(() => {
    // 1. Initial check from localStorage with iOS Glass trial activation
    if (typeof window !== 'undefined') {
      const storedTheme = localStorage.getItem('bibo_user_theme') as ThemeId;
      const storedGender = localStorage.getItem('bibo_user_gender') as GenderTheme;
      const glassTrialActivated = localStorage.getItem('bibo_glass_trial_v1');

      let resolvedTheme: ThemeId = 'ios-glass';
      let resolvedGender: GenderTheme = storedGender || 'default';

      if (!glassTrialActivated) {
        // Automatically activate Glass UI trial as requested
        resolvedTheme = 'ios-glass';
        localStorage.setItem('bibo_glass_trial_v1', 'true');
        localStorage.setItem('bibo_user_theme', 'ios-glass');
      } else if (storedTheme && THEMES[storedTheme]) {
        resolvedTheme = storedTheme;
        resolvedGender = THEMES[storedTheme].category;
      } else if (storedGender === 'female') {
        resolvedTheme = 'rose-aura';
        resolvedGender = 'female';
      } else if (storedGender === 'male') {
        resolvedTheme = 'ios-glass';
        resolvedGender = 'male';
      }

      setThemeState(resolvedTheme);
      setGenderState(resolvedGender);
      applyThemeClass(resolvedTheme, resolvedGender);
    }

    // 2. Fetch authenticated user profile preference from Supabase
    async function syncUserTheme() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('theme, gender')
            .eq('id', user.id)
            .maybeSingle();

          const userTheme = (profile?.theme || user.user_metadata?.theme) as ThemeId;
          const userGender = (profile?.gender || user.user_metadata?.gender || 'default') as GenderTheme;

          let resolvedTheme = theme;
          let resolvedGender = userGender;

          if (userTheme && THEMES[userTheme]) {
            resolvedTheme = userTheme;
            resolvedGender = THEMES[userTheme].category;
          } else if (userGender === 'female') {
            resolvedTheme = 'rose-aura';
          } else if (userGender === 'male') {
            resolvedTheme = 'ios-glass';
          }

          setThemeState(resolvedTheme);
          setGenderState(resolvedGender);
          localStorage.setItem('bibo_user_theme', resolvedTheme);
          localStorage.setItem('bibo_user_gender', resolvedGender);
          applyThemeClass(resolvedTheme, resolvedGender);
        }
      } catch (err) {
        console.error('Error syncing user theme:', err);
      }
    }

    syncUserTheme();

    // 3. Listen to auth state changes (e.g. login/logout)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        const userTheme = session.user.user_metadata?.theme as ThemeId;
        const userGender = (session.user.user_metadata?.gender || 'default') as GenderTheme;

        let resolvedTheme: ThemeId = 'ios-glass';
        let resolvedGender: GenderTheme = userGender;

        if (userTheme && THEMES[userTheme]) {
          resolvedTheme = userTheme;
          resolvedGender = THEMES[userTheme].category;
        } else if (userGender === 'female') {
          resolvedTheme = 'rose-aura';
        } else if (userGender === 'male') {
          resolvedTheme = 'ios-glass';
        }

        setThemeState(resolvedTheme);
        setGenderState(resolvedGender);
        localStorage.setItem('bibo_user_theme', resolvedTheme);
        localStorage.setItem('bibo_user_gender', resolvedGender);
        applyThemeClass(resolvedTheme, resolvedGender);
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, [supabase]);

  // Set Theme explicitly
  const setTheme = async (newTheme: ThemeId) => {
    if (!THEMES[newTheme]) return;
    const category = THEMES[newTheme].category;

    setThemeState(newTheme);
    setGenderState(category);

    if (typeof window !== 'undefined') {
      localStorage.setItem('bibo_user_theme', newTheme);
      localStorage.setItem('bibo_user_gender', category);
      applyThemeClass(newTheme, category);
    }

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        await supabase.auth.updateUser({
          data: { theme: newTheme, gender: category },
        });

        // Also update profiles table for redundancy and cross-device persistence
        try {
          await supabase.from('profiles').upsert(
            {
              id: user.id,
              full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
              theme: newTheme,
              gender: category,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'id' }
          );
        } catch {}
      }
    } catch (err) {
      console.error('Failed to persist theme:', err);
    }
  };

  // Set Gender category (switches to default theme for that category if needed)
  const setGender = async (newGender: GenderTheme) => {
    setGenderState(newGender);

    let targetTheme: ThemeId = theme;
    if (newGender === 'female' && (theme === 'midnight-pulse' || theme === 'forest-gravity' || theme === 'ios-glass')) {
      targetTheme = 'rose-aura';
      setThemeState('rose-aura');
    } else if ((newGender === 'male' || newGender === 'default') && (theme === 'violet-dream' || theme === 'rose-aura')) {
      targetTheme = 'ios-glass';
      setThemeState('ios-glass');
    }

    if (typeof window !== 'undefined') {
      localStorage.setItem('bibo_user_gender', newGender);
      localStorage.setItem('bibo_user_theme', targetTheme);
      applyThemeClass(targetTheme, newGender);
    }

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        await supabase.auth.updateUser({
          data: { gender: newGender, theme: targetTheme },
        });

        try {
          await supabase.from('profiles').upsert(
            {
              id: user.id,
              full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
              theme: targetTheme,
              gender: newGender,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'id' }
          );
        } catch {}
      }
    } catch (err) {
      console.error('Failed to persist gender preference:', err);
    }
  };

  const isGirly = theme === 'violet-dream' || theme === 'rose-aura' || gender === 'female';
  const activeThemeConfig = THEMES[theme] || THEMES['midnight-pulse'];

  return (
    <ThemeContext.Provider
      value={{
        gender,
        setGender,
        theme,
        setTheme,
        isGirly,
        activeThemeConfig,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
