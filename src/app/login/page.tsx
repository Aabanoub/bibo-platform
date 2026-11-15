'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, Lock, Eye, EyeOff, Sparkles, ArrowRight, UserPlus, LogIn } from 'lucide-react';
import { createClient } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });

        if (error) {
          setMessage({ type: 'error', text: error.message });
          return;
        }

        if (data.user && !data.session) {
          setMessage({
            type: 'success',
            text: 'Account created! Check your email to confirm your account.',
          });
        } else {
          router.push('/');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          setMessage({ type: 'error', text: error.message });
          return;
        }

        router.push('/');
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'An unexpected error occurred. Please try again.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0f172a] px-4">
      {/* Background subtle gradients */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-purple-500/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md animate-fade-in">
        {/* Logo & Title */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 shadow-lg shadow-blue-500/25">
            <Sparkles size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">
            Welcome to{' '}
            <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
              AbanoubApp
            </span>
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            {isSignUp
              ? 'Create your account to get started'
              : 'Sign in to your personal AI platform'}
          </p>
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

          <form onSubmit={handleSubmit} className="space-y-5">
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
                  placeholder="you@example.com"
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
                  placeholder={isSignUp ? 'Create a password (min 6 chars)' : 'Enter your password'}
                  required
                  minLength={6}
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

          {/* Toggle sign up / sign in */}
          <div className="mt-6 border-t border-slate-700/50 pt-5 text-center">
            <p className="text-sm text-slate-400">
              {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
              <button
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setMessage(null);
                }}
                className="inline-flex items-center gap-1 font-medium text-blue-400 transition-colors hover:text-blue-300"
              >
                {isSignUp ? 'Sign in' : 'Sign up'}
                <ArrowRight size={14} />
              </button>
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-slate-600">
          Your personal AI-powered productivity platform
        </p>
      </div>
    </div>
  );
}
