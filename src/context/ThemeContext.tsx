'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';

export type GenderTheme = 'female' | 'male' | 'default';

interface ThemeContextType {
  gender: GenderTheme;
  setGender: (gender: GenderTheme) => Promise<void>;
  isGirly: boolean;
}

const ThemeContext = createContext<ThemeContextType>({
  gender: 'default',
  setGender: async () => {},
  isGirly: false,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [gender, setGenderState] = useState<GenderTheme>('default');
  const supabase = createClient();

  // Apply CSS class to document root
  const applyThemeClass = (theme: GenderTheme) => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (theme === 'female') {
      root.classList.add('theme-female');
      root.setAttribute('data-theme', 'female');
    } else {
      root.classList.remove('theme-female');
      root.removeAttribute('data-theme');
    }
  };

  useEffect(() => {
    // 1. Initial quick check from localStorage (instant, zero delay)
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('bibo_user_gender') as GenderTheme;
      if (stored === 'female' || stored === 'male') {
        setGenderState(stored);
        applyThemeClass(stored);
      }
    }

    // 2. Fetch authenticated user profile preference from Supabase
    async function syncUserGender() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (user) {
          const userGender = (user.user_metadata?.gender || 'default') as GenderTheme;
          if (userGender && (userGender === 'female' || userGender === 'male')) {
            setGenderState(userGender);
            localStorage.setItem('bibo_user_gender', userGender);
            applyThemeClass(userGender);
          }
        }
      } catch (err) {
        console.error('Error syncing user gender theme:', err);
      }
    }

    syncUserGender();

    // 3. Listen to auth state changes (e.g. login/logout)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        const userGender = (session.user.user_metadata?.gender || 'default') as GenderTheme;
        if (userGender && (userGender === 'female' || userGender === 'male')) {
          setGenderState(userGender);
          localStorage.setItem('bibo_user_gender', userGender);
          applyThemeClass(userGender);
        }
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, [supabase]);

  const setGender = async (newGender: GenderTheme) => {
    setGenderState(newGender);
    if (typeof window !== 'undefined') {
      localStorage.setItem('bibo_user_gender', newGender);
      applyThemeClass(newGender);
    }

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        await supabase.auth.updateUser({
          data: { gender: newGender },
        });

        // Also upsert profile row
        try {
          await supabase.from('profiles').upsert(
            {
              id: user.id,
              full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'id' }
          );
        } catch {}
      }
    } catch (err) {
      console.error('Failed to persist gender theme:', err);
    }
  };

  return (
    <ThemeContext.Provider value={{ gender, setGender, isGirly: gender === 'female' }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
