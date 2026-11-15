'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, Lock, Eye, EyeOff, Sparkles, ArrowRight, UserPlus, LogIn, Zap, CheckCircle2 } from 'lucide-react';
import { createClient, setStoredBetaUser } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  function signInAsBeta(targetEmail?: string) {
    const finalEmail = (targetEmail || email).trim() || 'abanoub@app.local';
    const namePart = finalEmail.split('@')[0] || 'Abanoub';
    const capitalizedName = namePart.charAt(0).toUpperCase() + namePart.slice(1);

    const betaUser = {
      id: '00000000-0000-0000-0000-000000000001',
      email: finalEmail,
      name: capitalizedName,
    };

    setStoredBetaUser(betaUser);
    setMessage({ type: 'success', text: `Welcome, ${capitalizedName}! Signing you in...` });

    setTimeout(() => {
      window.location.href = '/';
    }, 400);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setMessage({ type: 'error', text: 'Please enter an email address.' });
      setLoading(false);
      return;
    }

    try {
      // 1. Try real Supabase auth if connected
      const isPlaceholder =
        !process.env.NEXT_PUBLIC_SUPABASE_URL ||
        process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder');

      if (!isPlaceholder) {
        if (isSignUp) {
          const { data, error } = await supabase.auth.signUp({
            email: cleanEmail,
            password: password || 'beta-pass-123',
          });

          if (!error && data?.session) {
            router.push('/');
            return;
          }
        } else {
          const { error } = await supabase.auth.signInWithPassword({
            email: cleanEmail,
            password: password || 'beta-pass-123',
          });

          if (!error) {
            router.push('/');
            return;
          }
        }
      }

      // 2. Beta mode: Allow signing in with ANY email and password!
      signInAsBeta(cleanEmail);
    } catch {
      // Fallback for beta mode on any error
      signInAsBeta(cleanEmail);
    } finally {
      setLoading(false);
    }
  }

  function handleInstantDemo() {
    setLoading(true);
    signInAsBeta('abanoub@app.local');
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0f172a] px-4 py-8">
      {/* Background subtle gradients */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-purple-500/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md animate-fade-in">
        {/* Logo & Title */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 shadow-lg shadow-blue-500/25">
            <Sparkles size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">
            Welcome to{' '}
            <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
              AbanoubApp
            </span>
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {isSignUp
              ? 'Create your account to get started'
              : 'Sign in to your personal AI platform'}
          </p>

          {/* Beta badge */}
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
            <CheckCircle2 size={13} />
            <span>Beta Mode Active: Any email & password works</span>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-slate-700/50 bg-slate-800/50 p-6 shadow-2xl shadow-black/20 backdrop-blur-sm sm:p-8">
          {/* Toast message */}
          {message && (
            <div
              className={`mb-6 animate-slide-in rounded-lg px-4 py-3 text-sm ${
                message.type === 'error'
                  ? 'border border-red-500/20 bg-red-500/10 text-red-400'
                  : 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
              }`}
            >
              {message.text}
            </div>
          )}

          {/* Quick Demo Button */}
          <button
            type="button"
            onClick={handleInstantDemo}
            disabled={loading}
            className="mb-5 flex w-full items-center justify-center gap-2 rounded-xl border border-blue-500/40 bg-gradient-to-r from-blue-600/30 to-cyan-600/30 px-4 py-3 text-sm font-semibold text-blue-200 transition-all hover:border-blue-400 hover:from-blue-600/40 hover:to-cyan-600/40 focus:outline-none focus:ring-2 focus:ring-blue-500/40 active:scale-[0.99]"
          >
            <Zap size={16} className="text-yellow-400 fill-yellow-400" />
            <span>⚡ Instant 1-Click Beta Sign In</span>
          </button>

          <div className="relative mb-5 flex items-center justify-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-700/60" />
            </div>
            <span className="relative bg-slate-800/80 px-3 text-xs uppercase tracking-wider text-slate-500">
              or enter any credentials
            </span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email field */}
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-300">
                Email address
              </label>
              <div className="relative">
                <Mail
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"
                />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="any-email@domain.com"
                  required
                  autoComplete="email"
                  className="input pl-10"
                />
              </div>
            </div>

            {/* Password field */}
            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-sm font-medium text-slate-300"
              >
                Password
              </label>
              <div className="relative">
                <Lock
                  size={16}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"
                />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="any password"
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  className="input pl-10 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 transition-colors hover:text-slate-300"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : isSignUp ? (
                <>
                  <UserPlus size={18} />
                  Sign In with this Email
                </>
              ) : (
                <>
                  <LogIn size={18} />
                  Sign In with this Email
                </>
              )}
            </button>
          </form>

          {/* Toggle hint */}
          <div className="mt-5 border-t border-slate-700/50 pt-4 text-center">
            <p className="text-xs text-slate-400">
              💡 Tip: Since this is the beta version, you don&apos;t need to verify your email. Any email & password works!
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-slate-600">
          Your personal AI-powered productivity platform • AbanoubApp Beta
        </p>
      </div>
    </div>
  );
}
