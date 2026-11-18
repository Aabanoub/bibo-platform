'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase';
import { Sparkles, Database, Check } from 'lucide-react';

export default function AppSplashLoader() {
  const [mounted, setMounted] = useState(true);
  const [visible, setVisible] = useState(true);
  const [progress, setProgress] = useState(15);
  const [statusText, setStatusText] = useState('Initializing Evolve...');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Only run the splash on initial page load / app start
    // If user has already seen splash in this browser session, keep it short or don't block
    let isSubscribed = true;
    const supabase = createClient();
    const startTime = Date.now();
    const minDisplayDuration = 1500; // 1.5s for a smooth, enjoyable cinematic animation

    async function initializeApp() {
      try {
        if (!isSubscribed) return;
        setProgress(35);
        setStatusText('Connecting to cloud database...');

        // Verify Supabase session & connection in parallel with progress
        const sessionPromise = supabase.auth.getSession().catch(() => null);

        // Advance progress smoothly
        setTimeout(() => {
          if (isSubscribed) {
            setProgress(70);
            setStatusText('Synchronizing your workspace...');
          }
        }, 500);

        setTimeout(() => {
          if (isSubscribed) {
            setProgress(90);
            setStatusText('Preparing your personal dashboard...');
          }
        }, 1000);

        await sessionPromise;

        const elapsedTime = Date.now() - startTime;
        const remainingDelay = Math.max(0, minDisplayDuration - elapsedTime);

        setTimeout(() => {
          if (!isSubscribed) return;
          setProgress(100);
          setStatusText('Welcome to Evolve');
          setIsReady(true);

          // Fade out smoothly
          setTimeout(() => {
            if (!isSubscribed) return;
            setVisible(false);

            // Unmount from DOM after fade-out transition completes
            setTimeout(() => {
              if (isSubscribed) {
                setMounted(false);
              }
            }, 550);
          }, 350);
        }, remainingDelay);
      } catch (e) {
        // Even if network fails, never trap user on splash
        setTimeout(() => {
          if (isSubscribed) {
            setVisible(false);
            setTimeout(() => setMounted(false), 500);
          }
        }, minDisplayDuration);
      }
    }

    initializeApp();

    return () => {
      isSubscribed = false;
    };
  }, []);

  if (!mounted) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#070b14] select-none transition-all duration-500 ease-out ${
        visible ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-105 pointer-events-none'
      }`}
    >
      {/* Dynamic Ambient Background Glows */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {/* Purple/Violet radial glow */}
        <div className="absolute -top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-gradient-to-br from-purple-600/20 via-pink-600/10 to-transparent rounded-full blur-[120px] animate-evolve-glow" />
        {/* Cyan/Blue radial glow */}
        <div className="absolute -bottom-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-gradient-to-tr from-blue-600/20 via-cyan-500/10 to-transparent rounded-full blur-[120px] animate-evolve-glow" style={{ animationDelay: '1.2s' }} />
        {/* Subtle background stars grid */}
        <div className="absolute inset-0 bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:24px_24px] opacity-15" />
      </div>

      {/* Center Container */}
      <div className="relative z-10 flex flex-col items-center">
        {/* Animated Orbiting Ring & Logo Wrapper */}
        <div className="relative w-36 h-36 sm:w-44 sm:h-44 flex items-center justify-center">
          {/* Outer Pulsing Neon Aura */}
          <div className="absolute inset-2 rounded-3xl bg-gradient-to-tr from-purple-500/30 via-pink-500/20 to-blue-500/30 blur-2xl animate-evolve-glow" />

          {/* Orbiting Ring (SVG with glowing cyan-purple gradient) */}
          <svg className="absolute -inset-4 w-[calc(100%+32px)] h-[calc(100%+32px)] pointer-events-none animate-evolve-orbit" viewBox="0 0 200 200">
            <defs>
              <linearGradient id="orbitGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#c084fc" stopOpacity="0.8" />
                <stop offset="50%" stopColor="#60a5fa" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.9" />
              </linearGradient>
            </defs>
            <circle
              cx="100"
              cy="100"
              r="86"
              fill="none"
              stroke="url(#orbitGradient)"
              strokeWidth="2"
              strokeDasharray="24 16 48 20"
              className="opacity-70"
            />
            {/* Sparkling satellite dot on orbit */}
            <circle cx="100" cy="14" r="3.5" fill="#38bdf8" className="shadow-lg shadow-cyan-400 animate-pulse" />
          </svg>

          {/* Hero App Logo with 3D Float Animation */}
          <div className="relative w-28 h-28 sm:w-36 sm:h-36 rounded-3xl overflow-hidden shadow-2xl shadow-purple-900/40 border border-purple-500/30 animate-evolve-float bg-[#0f172a]">
            {/* Shimmer overlay */}
            <div className="absolute inset-0 z-20 pointer-events-none bg-gradient-to-r from-transparent via-white/15 to-transparent animate-evolve-shimmer" />

            <img
              src="/logo.png"
              alt="Evolve Logo"
              className="w-full h-full object-cover select-none"
            />
          </div>
        </div>

        {/* Brand Title: EVOLVE */}
        <div className="mt-7 text-center">
          <h1 className="text-2xl sm:text-3xl font-black tracking-[0.3em] uppercase bg-clip-text text-transparent bg-gradient-to-r from-violet-400 via-pink-300 to-cyan-400 drop-shadow-sm font-sans pl-[0.3em]">
            Evolve
          </h1>
          <p className="text-[11px] font-semibold tracking-widest text-slate-400 uppercase mt-1">
            Personal Operating System
          </p>
        </div>

        {/* Dynamic Database Status & Progress Bar */}
        <div className="mt-8 flex flex-col items-center gap-3 w-64 sm:w-72">
          {/* Progress track */}
          <div className="w-full h-1.5 rounded-full bg-slate-900 border border-slate-800/80 overflow-hidden relative shadow-inner">
            <div
              className="h-full bg-gradient-to-r from-purple-500 via-pink-400 to-cyan-400 rounded-full transition-all duration-300 ease-out relative"
              style={{ width: `${progress}%` }}
            >
              {/* Glowing leading light */}
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white shadow-md shadow-cyan-300" />
            </div>
          </div>

          {/* Status Message */}
          <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
            {isReady ? (
              <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[3]" />
            ) : (
              <div className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
            )}
            <span className="transition-all duration-200">{statusText}</span>
          </div>
        </div>
      </div>

      {/* Bottom Subtle Watermark */}
      <div className="absolute bottom-6 text-[10px] text-slate-600 tracking-wider uppercase font-semibold">
        AI Cockpit & Productivity Suite
      </div>
    </div>
  );
}
