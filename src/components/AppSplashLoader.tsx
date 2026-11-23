'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useTheme, type ThemeId } from '@/context/ThemeContext';
import { createClient } from '@/lib/supabase';

interface ThemeSplashConfig {
  bg: string;
  glowPrimary: string;
  glowSecondary: string;
  accentGradient: string;
  logoBorder: string;
  logoShadow: string;
  orbitStops: { stop1: string; stop2: string; stop3: string };
  textGradient: string;
  taglineColor: string;
  beamGradient: string;
  arrowGlow: string;
  satelliteColor: string;
}

const THEME_SPLASH_MAP: Record<ThemeId, ThemeSplashConfig> = {
  'midnight-pulse': {
    bg: '#080E1C',
    glowPrimary: 'rgba(37, 99, 235, 0.28)', // #2563EB
    glowSecondary: 'rgba(6, 182, 212, 0.22)', // #06B6D4
    accentGradient: 'from-blue-600 to-cyan-400',
    logoBorder: 'border-blue-500/40',
    logoShadow: 'shadow-blue-500/25',
    orbitStops: { stop1: '#2563eb', stop2: '#38bdf8', stop3: '#06b6d4' },
    textGradient: 'from-blue-400 via-cyan-200 to-white',
    taglineColor: 'text-cyan-300/80',
    beamGradient: 'from-transparent via-cyan-400/80 to-transparent',
    arrowGlow: 'text-cyan-400 shadow-cyan-400/50',
    satelliteColor: '#06b6d4',
  },
  'forest-gravity': {
    bg: '#09140F',
    glowPrimary: 'rgba(22, 163, 106, 0.28)', // #16A36A
    glowSecondary: 'rgba(163, 230, 53, 0.22)', // #A3E635
    accentGradient: 'from-emerald-600 to-lime-400',
    logoBorder: 'border-emerald-500/40',
    logoShadow: 'shadow-emerald-500/25',
    orbitStops: { stop1: '#16a36a', stop2: '#84cc16', stop3: '#a3e635' },
    textGradient: 'from-emerald-400 via-lime-200 to-white',
    taglineColor: 'text-lime-300/80',
    beamGradient: 'from-transparent via-lime-400/80 to-transparent',
    arrowGlow: 'text-lime-400 shadow-lime-400/50',
    satelliteColor: '#a3e635',
  },
  'violet-dream': {
    bg: '#130D20',
    glowPrimary: 'rgba(147, 51, 234, 0.28)', // #9333EA
    glowSecondary: 'rgba(236, 72, 153, 0.22)', // #EC4899
    accentGradient: 'from-purple-600 to-pink-500',
    logoBorder: 'border-purple-500/40',
    logoShadow: 'shadow-purple-500/25',
    orbitStops: { stop1: '#9333ea', stop2: '#d946ef', stop3: '#ec4899' },
    textGradient: 'from-purple-400 via-pink-200 to-white',
    taglineColor: 'text-pink-300/80',
    beamGradient: 'from-transparent via-pink-400/80 to-transparent',
    arrowGlow: 'text-pink-400 shadow-pink-400/50',
    satelliteColor: '#ec4899',
  },
  'rose-aura': {
    bg: '#190D16',
    glowPrimary: 'rgba(232, 74, 117, 0.28)', // #E84A75
    glowSecondary: 'rgba(251, 154, 141, 0.22)', // #FB9A8D
    accentGradient: 'from-rose-500 to-orange-300',
    logoBorder: 'border-rose-500/40',
    logoShadow: 'shadow-rose-500/25',
    orbitStops: { stop1: '#e84a75', stop2: '#f43f5e', stop3: '#fb9a8d' },
    textGradient: 'from-rose-400 via-orange-200 to-white',
    taglineColor: 'text-rose-300/80',
    beamGradient: 'from-transparent via-rose-400/80 to-transparent',
    arrowGlow: 'text-rose-400 shadow-rose-400/50',
    satelliteColor: '#fb9a8d',
  },
  'ios-glass': {
    bg: '#070B16',
    glowPrimary: 'rgba(10, 132, 255, 0.32)',
    glowSecondary: 'rgba(94, 92, 230, 0.28)',
    accentGradient: 'from-[#0A84FF] via-[#5E5CE6] to-[#64D2FF]',
    logoBorder: 'border-white/30',
    logoShadow: 'shadow-blue-500/35',
    orbitStops: { stop1: '#0A84FF', stop2: '#5E5CE6', stop3: '#64D2FF' },
    textGradient: 'from-sky-300 via-blue-200 to-white',
    taglineColor: 'text-sky-300/85',
    beamGradient: 'from-transparent via-sky-400/80 to-transparent',
    arrowGlow: 'text-sky-400 shadow-sky-400/50',
    satelliteColor: '#64D2FF',
  },
};

export default function AppSplashLoader() {
  const { theme } = useTheme();

  // Resolve initial theme from context or localStorage before mount
  const activeThemeId: ThemeId = useMemo(() => {
    if (theme && THEME_SPLASH_MAP[theme]) return theme;
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('bibo_user_theme') as ThemeId;
      if (stored && THEME_SPLASH_MAP[stored]) return stored;
    }
    return 'midnight-pulse';
  }, [theme]);

  const cfg = THEME_SPLASH_MAP[activeThemeId] || THEME_SPLASH_MAP['midnight-pulse'];

  // Animation Sequence Stages:
  // 1: 0-400ms (Dark Screen + Ambient Glow emergence)
  // 2: 400-1200ms (Logo & Monogram Formation, Orbital draw, Arrow nudge)
  // 3: 1200-1800ms (Brand Reveal: EVOLVE + BECOME YOUR BEST + Light beam)
  // 4: 1800-2300ms (Hold & Seamless Transition to Dashboard)
  const [stage, setStage] = useState<1 | 2 | 3 | 4>(1);
  const [visible, setVisible] = useState(true);
  const [mounted, setMounted] = useState(true);
  const [isDbReady, setIsDbReady] = useState(false);
  const [extendedLoading, setExtendedLoading] = useState(false);

  useEffect(() => {
    // Only display the animated intro on fresh application launch / browser session
    // Internal client-side route navigation will not re-trigger it
    if (typeof window !== 'undefined') {
      const alreadyShown = sessionStorage.getItem('evolve_intro_shown');
      if (alreadyShown === 'true') {
        setMounted(false);
        return;
      }
    }

    let isSubscribed = true;
    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reducedMotion) {
      // Simplified reveal for accessibility
      setStage(3);
      const timer = setTimeout(() => {
        if (!isSubscribed) return;
        setVisible(false);
        try {
          sessionStorage.setItem('evolve_intro_shown', 'true');
        } catch {}
        setTimeout(() => setMounted(false), 200);
      }, 400);
      return () => {
        isSubscribed = false;
        clearTimeout(timer);
      };
    }

    // ── Application Initialization in parallel with animation ────────────────
    const supabase = createClient();
    const sessionCheck = supabase.auth.getSession().catch(() => null);

    sessionCheck.finally(() => {
      if (isSubscribed) {
        setIsDbReady(true);
      }
    });

    // ── Rapid Animation Timeline Timers (Optimized for instant-feeling load) ─────
    // Stage 1 -> 2: 120ms
    const tStage2 = setTimeout(() => {
      if (isSubscribed) setStage(2);
    }, 120);

    // Stage 2 -> 3: 320ms
    const tStage3 = setTimeout(() => {
      if (isSubscribed) setStage(3);
    }, 320);

    // Stage 3 -> 4: 550ms
    const tStage4 = setTimeout(() => {
      if (isSubscribed) setStage(4);
    }, 550);

    // Stage 4 -> Transition check: 750ms
    const tTransition = setTimeout(() => {
      if (!isSubscribed) return;

      const finishSplash = () => {
        setVisible(false);
        try {
          sessionStorage.setItem('evolve_intro_shown', 'true');
        } catch {}
        setTimeout(() => {
          if (isSubscribed) setMounted(false);
        }, 350);
      };

      // If DB session is ready (or completes quickly), transition immediately
      sessionCheck.then(() => {
        finishSplash();
      });

      // If DB is taking unusually long, show minimal non-blocking indicator
      const extendedTimer = setTimeout(() => {
        if (isSubscribed && visible) {
          setExtendedLoading(true);
        }
      }, 300);

      // Maximum safety fallback: never leave user trapped on splash
      const maxSafety = setTimeout(() => {
        if (isSubscribed) finishSplash();
      }, 1500);

      return () => {
        clearTimeout(extendedTimer);
        clearTimeout(maxSafety);
      };
    }, 750);

    return () => {
      isSubscribed = false;
      clearTimeout(tStage2);
      clearTimeout(tStage3);
      clearTimeout(tStage4);
      clearTimeout(tTransition);
    };
  }, []);

  if (!mounted) return null;

  return (
    <div
      role="status"
      aria-label="Loading EVOLVE"
      style={{ backgroundColor: cfg.bg }}
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center select-none overflow-hidden transition-all duration-500 ease-out ${
        visible
          ? 'opacity-100 scale-100 pointer-events-auto'
          : 'opacity-0 scale-[1.02] pointer-events-none'
      }`}
    >
      {/* ── Ambient Radial Glows (Adapts to Active Theme) ───────────────────── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Primary Accent Glow */}
        <div
          className="absolute -top-24 left-1/2 -translate-x-1/2 w-[620px] h-[620px] rounded-full blur-[130px] transition-opacity duration-1000 ease-out"
          style={{
            backgroundColor: cfg.glowPrimary,
            opacity: stage >= 1 ? 1 : 0,
          }}
        />
        {/* Secondary Accent Glow */}
        <div
          className="absolute -bottom-24 left-1/2 -translate-x-1/2 w-[540px] h-[540px] rounded-full blur-[130px] transition-opacity duration-1000 ease-out"
          style={{
            backgroundColor: cfg.glowSecondary,
            opacity: stage >= 2 ? 1 : 0,
          }}
        />
        {/* Subtle grid pattern for depth */}
        <div className="absolute inset-0 bg-[radial-gradient(#ffffff_0.75px,transparent_0.75px)] [background-size:28px_28px] opacity-[0.06]" />
      </div>

      {/* ── Center Stage ───────────────────────────────────────────────────── */}
      <div className="relative z-10 flex flex-col items-center">
        {/* Logo & Orbital Composition */}
        <div className="relative w-36 h-36 sm:w-44 sm:h-44 flex items-center justify-center">
          {/* Neon Aura Glow around Logo Card */}
          <div
            className={`absolute inset-4 rounded-3xl blur-2xl transition-all duration-700 ease-out ${
              stage >= 2 ? 'opacity-80 scale-100' : 'opacity-0 scale-75'
            }`}
            style={{
              background: `radial-gradient(circle, ${cfg.glowPrimary} 0%, ${cfg.glowSecondary} 100%)`,
            }}
          />

          {/* SVG Orbital Element (Stage 2: draws itself around the logo) */}
          <svg
            className={`absolute -inset-5 w-[calc(100%+40px)] h-[calc(100%+40px)] pointer-events-none transition-opacity duration-700 ${
              stage >= 2 ? 'opacity-100 animate-evolve-orbit' : 'opacity-0'
            }`}
            viewBox="0 0 220 220"
          >
            <defs>
              <linearGradient id="splashOrbitGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={cfg.orbitStops.stop1} stopOpacity="0.9" />
                <stop offset="50%" stopColor={cfg.orbitStops.stop2} stopOpacity="0.4" />
                <stop offset="100%" stopColor={cfg.orbitStops.stop3} stopOpacity="0.95" />
              </linearGradient>
            </defs>
            {/* Smooth glowing orbital trajectory */}
            <circle
              cx="110"
              cy="110"
              r="94"
              fill="none"
              stroke="url(#splashOrbitGradient)"
              strokeWidth="2"
              className={stage >= 2 ? 'animate-evolve-draw-orbit' : ''}
            />
            {/* Glowing orbital satellite dot */}
            <circle
              cx="110"
              cy="16"
              r="3.5"
              fill={cfg.satelliteColor}
              className="drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]"
            />
          </svg>

          {/* Core Approved EVOLVE Logo Card */}
          <div
            className={`relative w-28 h-28 sm:w-36 sm:h-36 rounded-3xl overflow-hidden border bg-zinc-950/80 shadow-2xl transition-all duration-700 ease-out ${
              cfg.logoBorder
            } ${cfg.logoShadow} ${
              stage >= 2
                ? 'opacity-100 scale-100 translate-y-0'
                : 'opacity-0 scale-90 translate-y-3'
            } animate-evolve-float`}
          >
            {/* Shimmer light sweep */}
            <div className="absolute inset-0 z-20 pointer-events-none bg-gradient-to-r from-transparent via-white/20 to-transparent animate-evolve-shimmer" />

            {/* Official EVOLVE Logo Asset (Letter E, Bibo monogram, upward arrow, orbital swoosh) */}
            <img
              src="/logo.png"
              alt="EVOLVE"
              className="w-full h-full object-cover select-none"
              draggable={false}
            />
          </div>

          {/* Upward Growth Arrow Sparkle Accent (Upper Right) */}
          <div
            className={`absolute -top-1 -right-1 z-30 transition-all duration-700 ease-out ${
              stage >= 2 ? 'opacity-100 scale-100' : 'opacity-0 scale-50'
            }`}
          >
            <div className="animate-evolve-sparkle">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path
                  d="M7 17L17 7M17 7H9M17 7V15"
                  stroke={cfg.satelliteColor}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="drop-shadow-[0_0_6px_currentColor]"
                />
              </svg>
            </div>
          </div>
        </div>

        {/* ── Brand Reveal (Stage 3: 1200ms–1800ms) ─────────────────────────── */}
        <div className="mt-8 flex flex-col items-center text-center">
          {/* Brand Name: EVOLVE */}
          <div
            className={`transition-all duration-600 ease-out ${
              stage >= 3
                ? 'opacity-100 translate-y-0'
                : 'opacity-0 translate-y-3'
            }`}
          >
            <h1
              className={`text-2xl sm:text-3xl font-black tracking-[0.35em] uppercase pl-[0.35em] bg-clip-text text-transparent bg-gradient-to-r ${cfg.textGradient} drop-shadow-sm font-sans`}
            >
              Evolve
            </h1>
          </div>

          {/* Tagline: BECOME YOUR BEST */}
          <div
            className={`mt-2 transition-all duration-600 delay-100 ease-out ${
              stage >= 3
                ? 'opacity-100 translate-y-0'
                : 'opacity-0 translate-y-2'
            }`}
          >
            <p
              className={`text-[10px] sm:text-xs font-semibold tracking-[0.3em] uppercase pl-[0.3em] ${cfg.taglineColor}`}
            >
              Become Your Best
            </p>
          </div>

          {/* Sleek Horizontal Light Divider Beam */}
          <div
            className={`mt-4 h-[1px] w-48 max-w-xs transition-all duration-700 ease-out ${
              stage >= 3 ? 'opacity-100 scale-x-100' : 'opacity-0 scale-x-0'
            }`}
          >
            <div
              className={`h-full w-full bg-gradient-to-r ${cfg.beamGradient} rounded-full`}
            />
          </div>

          {/* Minimal Fallback Status Indicator if DB initialization is extended */}
          {extendedLoading && !isDbReady && (
            <div className="mt-4 flex items-center gap-2 text-xs font-medium text-slate-400 animate-fade-in">
              <div
                className="w-1.5 h-1.5 rounded-full animate-ping"
                style={{ backgroundColor: cfg.satelliteColor }}
              />
              <span className="text-[11px] tracking-wider uppercase text-slate-400">
                Synchronizing workspace…
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Footer Subtitle ────────────────────────────────────────────────── */}
      <div
        className={`absolute bottom-6 text-[10px] tracking-[0.25em] uppercase font-semibold text-slate-600 transition-opacity duration-700 ${
          stage >= 3 ? 'opacity-70' : 'opacity-0'
        }`}
      >
        Personal Operating System
      </div>
    </div>
  );
}
