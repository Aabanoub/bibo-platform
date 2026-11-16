'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, Lock, Eye, EyeOff, Sparkles, ArrowRight, UserPlus, LogIn, Zap, CheckCircle2, AlertCircle } from 'lucide-react';
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

  // Check URL parameters on mount (?confirmed=true or ?error=...)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const confirmed = params.get('confirmed');
      const err = params.get('error');
      const errDesc = params.get('error_description');

      if (confirmed) {
        setMessage({
          type: 'success',
          text: '✅ Email verified successfully! You are now authenticated.',
        });
        supabase.auth.getSession().then(({ data }: any) => {
          if (data?.session) {
            setTimeout(() => router.push('/'), 700);
          }
        });
      } else if (err || errDesc) {
        setMessage({
          type: 'error',
          text: decodeURIComponent(errDesc || err || 'Email verification link was invalid or expired.'),
        });
      }
    }

    // Listen to Supabase auth state changes (e.g. hash token exchange)
    const { data: authListener } = supabase.auth.onAuthStateChange((event: any, session: any) => {
      if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && session?.user) {
        setMessage({ type: 'success', text: 'Authentication successful! Redirecting to dashboard...' });
        setTimeout(() => {
          router.push('/');
        }, 500);
      }
    });

    return () => {
      authListener?.subscription?.unsubscribe();
    };
  }, [router, supabase]);

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
      const isPlaceholder =
        !process.env.NEXT_PUBLIC_SUPABASE_URL ||
        process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder');

      if (!isPlaceholder) {
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        const emailRedirectTo = `${origin}/auth/callback`;

        if (isSignUp) {
          const { data, error } = await supabase.auth.signUp({
            email: cleanEmail,
            password: password || 'beta-pass-123',
            options: {
              emailRedirectTo,
            },
          });

          if (error) {
            setMessage({ type: 'error', text: error.message });
            setLoading(false);
            return;
          }

          if (data?.session) {
            setMessage({ type: 'success', text: 'Account created! Signing you in...' });
            router.push('/');
            return;
          }

          if (data?.user && !data?.session) {
            setMessage({
              type: 'success',
              text: `📩 Confirmation link sent to ${cleanEmail}! Please check your email inbox (and spam folder) and click the link to confirm your account.`,
            });
            setLoading(false);
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

          // If real Supabase returned unconfirmed email error
          if (error.message.toLowerCase().includes('email not confirmed')) {
            setMessage({
              type: 'error',
              text: '⚠️ Email is not confirmed yet. Please check your inbox for the confirmation link, or click "Enter Without Sign In" below for instant beta access.',
            });
            setLoading(false);
            return;
          }

          // If password was wrong or user not found on real Supabase, display it
          setMessage({ type: 'error', text: error.message });
          setLoading(false);
          return;
        }
      }

      // Beta mode fallback: If using placeholder or requested
      signInAsBeta(cleanEmail);
    } catch (err: any) {
      // Fallback for beta mode on any client error
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
              ? 'Create a new account to get started'
              : 'Sign in to your personal AI platform'}
          </p>

          {/* Beta badge */}
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
            <CheckCircle2 size={13} />
            <span>Beta Mode Active: Instant Access Enabled</span>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-slate-700/50 bg-slate-800/50 p-6 shadow-2xl shadow-black/20 backdrop-blur-sm sm:p-8">
          {/* Toast / Status message */}
          {message && (
            <div
              className={`mb-6 animate-slide-in rounded-xl p-4 text-sm flex items-start gap-3 ${
                message.type === 'error'
                  ? 'border border-red-500/30 bg-red-500/10 text-red-300'
                  : 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              }`}
            >
              {message.type === 'error' ? (
                <AlertCircle size={20} className="shrink-0 text-red-400 mt-0.5" />
              ) : (
                <CheckCircle2 size={20} className="shrink-0 text-emerald-400 mt-0.5" />
              )}
              <div className="leading-relaxed">{message.text}</div>
            </div>
          )}

          {/* Direct Enter Without Sign-In Button */}
          <button
            type="button"
            onClick={handleInstantDemo}
            disabled={loading}
            className="group mb-5 flex w-full items-center justify-between rounded-xl border border-emerald-500/40 bg-gradient-to-r from-emerald-600/25 via-teal-600/25 to-blue-600/25 p-4 text-left shadow-lg shadow-emerald-950/40 transition-all hover:border-emerald-400 hover:from-emerald-600/35 hover:via-teal-600/35 hover:to-blue-600/35 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 active:scale-[0.99]"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400">
                <Zap size={22} className="fill-emerald-400" />
              </div>
              <div>
                <div className="text-base font-semibold text-white group-hover:text-emerald-300">
                  Enter Without Sign In
                </div>
                <div className="text-xs text-slate-400">
                  Instant access • No email or password needed
                </div>
              </div>
            </div>
            <ArrowRight size={18} className="text-emerald-400 transition-transform group-hover:translate-x-1" />
          </button>

          <div className="relative mb-5 flex items-center justify-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-700/60" />
            </div>
            <span className="relative bg-slate-800/80 px-3 text-xs uppercase tracking-wider text-slate-500">
              or enter with custom email
            </span>
          </div>

          {/* Tabs: Sign In vs Sign Up */}
          <div className="mb-5 flex rounded-lg bg-slate-900/60 p-1 border border-slate-700/50">
            <button
              type="button"
              onClick={() => {
                setIsSignUp(false);
                setMessage(null);
              }}
              className={`flex-1 rounded-md py-2 text-xs font-semibold transition-all ${
                !isSignUp
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setIsSignUp(true);
                setMessage(null);
              }}
              className={`flex-1 rounded-md py-2 text-xs font-semibold transition-all ${
                isSignUp
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Create Account
            </button>
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
                  placeholder="your-email@example.com"
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
                  placeholder={isSignUp ? 'Choose a password (min 6 chars)' : 'Enter password'}
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
                  Create Account
                </>
              ) : (
                <>
                  <LogIn size={18} />
                  Sign In
                </>
              )}
            </button>
          </form>

          {/* Toggle hint */}
          <div className="mt-5 border-t border-slate-700/50 pt-4 text-center">
            <p className="text-xs text-slate-400">
              💡 Tip: Since this is the beta version, you don&apos;t need to wait for email verification. Click &quot;Enter Without Sign In&quot; to test everything immediately!
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
