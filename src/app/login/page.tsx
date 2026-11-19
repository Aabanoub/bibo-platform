'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  Sparkles,
  UserPlus,
  LogIn,
  CheckCircle2,
  AlertCircle,
  User,
  Send,
  HelpCircle,
} from 'lucide-react';
import { createClient } from '@/lib/supabase';

type AuthMode = 'signin' | 'signup' | 'forgot_password';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<AuthMode>('signin');
  const [fullName, setFullName] = useState('');
  const [gender, setGender] = useState<'female' | 'male'>('male');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState<{
    type: 'error' | 'success' | 'info';
    text: string;
    canResend?: boolean;
  } | null>(null);

  const handleGenderSelect = (val: 'female' | 'male') => {
    setGender(val);
    if (typeof window !== 'undefined') {
      localStorage.setItem('bibo_user_gender', val);
      if (val === 'female') {
        document.documentElement.classList.add('theme-female');
      } else {
        document.documentElement.classList.remove('theme-female');
      }
    }
  };

  // Check URL parameters and auth state on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const confirmed = params.get('confirmed');
      const err = params.get('error');
      const errDesc = params.get('error_description');
      const infoMsg = params.get('info');

      if (confirmed) {
        setMessage({
          type: 'success',
          text: infoMsg
            ? decodeURIComponent(infoMsg)
            : '✅ Email verified successfully! Please enter your password to sign in.',
        });
        setMode('signin');
      } else if (err || errDesc) {
        setMessage({
          type: 'error',
          text: decodeURIComponent(errDesc || err || 'Email verification failed or link expired.'),
          canResend: true,
        });
      }

      // Check if user is already logged in
      supabase.auth.getUser().then(({ data }: any) => {
        if (data?.user) {
          router.push('/');
        }
      });
    }

    // Listen for auth events (e.g. hash token exchange)
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

    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const emailRedirectTo = `${origin}/auth/callback`;

    try {
      // 1. Password Reset Mode
      if (mode === 'forgot_password') {
        const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo: emailRedirectTo,
        });

        if (error) {
          setMessage({ type: 'error', text: error.message });
        } else {
          setMessage({
            type: 'success',
            text: `Password reset link sent to ${cleanEmail}. Please check your inbox and follow the instructions.`,
          });
        }
        setLoading(false);
        return;
      }

      // 2. Sign Up Mode
      if (mode === 'signup') {
        if (!password || password.length < 6) {
          setMessage({ type: 'error', text: 'Password must be at least 6 characters long.' });
          setLoading(false);
          return;
        }

        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            emailRedirectTo,
            data: {
              full_name: fullName.trim() || cleanEmail.split('@')[0],
              name: fullName.trim() || cleanEmail.split('@')[0],
              gender,
            },
          },
        });

        if (!error) {
          if (typeof window !== 'undefined') {
            localStorage.setItem('bibo_user_gender', gender);
          }
        }

        if (error) {
          if (error.message.toLowerCase().includes('rate limit')) {
            setMessage({
              type: 'error',
              text: '⚠️ Supabase email rate limit reached. To sign in immediately without email limits, go to Supabase Dashboard ➔ Authentication ➔ Providers ➔ Email and switch "Confirm email" to OFF, or wait a few minutes.',
            });
            setLoading(false);
            return;
          }
          setMessage({ type: 'error', text: error.message });
          setLoading(false);
          return;
        }

        // Auto logged in (e.g. when email confirmation is disabled in Supabase)
        if (data?.session) {
          setMessage({ type: 'success', text: 'Account created! Signing you in...' });
          router.push('/');
          return;
        }

        // Email confirmation required
        if (data?.user && !data?.session) {
          setMessage({
            type: 'success',
            text: `📩 Account created! We have sent a verification link to ${cleanEmail}. Please check your inbox (and spam folder) and click the link to confirm your account.`,
            canResend: true,
          });
          setLoading(false);
          return;
        }
      }

      // 3. Sign In Mode
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        if (!error) {
          setMessage({ type: 'success', text: 'Signed in successfully! Redirecting...' });
          const params = new URLSearchParams(window.location.search);
          const redirectTo = params.get('redirectTo') || '/';
          router.push(redirectTo);
          return;
        }

        // Handle unconfirmed email
        if (error.message.toLowerCase().includes('email not confirmed')) {
          setMessage({
            type: 'error',
            text: '⚠️ Your email is not confirmed yet. Please click the confirmation link in the email we sent you, or click below to resend it.',
            canResend: true,
          });
          setLoading(false);
          return;
        }

        // Handle invalid credentials
        if (error.message.toLowerCase().includes('invalid login credentials')) {
          setMessage({
            type: 'error',
            text: 'Invalid email or password. Please double check your details or create an account.',
          });
          setLoading(false);
          return;
        }

        setMessage({ type: 'error', text: error.message });
      }
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err?.message || 'An unexpected error occurred. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  }

  // Resend confirmation email handler
  async function handleResendConfirmation() {
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setMessage({ type: 'error', text: 'Please enter your email address to resend confirmation.' });
      return;
    }

    setResending(true);
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: cleanEmail,
        options: {
          emailRedirectTo: `${origin}/auth/callback`,
        },
      });

      if (error) {
        setMessage({ type: 'error', text: error.message, canResend: true });
      } else {
        setMessage({
          type: 'success',
          text: `A new confirmation email has been sent to ${cleanEmail}. Please check your inbox.`,
        });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Failed to resend confirmation.' });
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0f172a] px-4 py-8">
      {/* Background ambient lighting */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div
          className={`absolute -top-40 -right-40 h-80 w-80 rounded-full blur-3xl transition-colors duration-500 ${
            gender === 'female' ? 'bg-pink-500/20' : 'bg-blue-500/10'
          }`}
        />
        <div
          className={`absolute -bottom-40 -left-40 h-80 w-80 rounded-full blur-3xl transition-colors duration-500 ${
            gender === 'female' ? 'bg-rose-500/20' : 'bg-indigo-500/10'
          }`}
        />
      </div>

      <div className="relative w-full max-w-md animate-fade-in">
        {/* Logo & Title */}
        <div className="mb-6 text-center">
          <div className="relative mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl overflow-hidden shadow-xl shadow-purple-500/25 border border-purple-500/30 bg-[#0f172a] animate-evolve-float">
            <img src="/logo.png" alt="Evolve" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-2xl font-black tracking-wider text-white">
            Welcome to{' '}
            <span
              className={`bg-clip-text text-transparent bg-gradient-to-r transition-all duration-300 ${
                gender === 'female'
                  ? 'from-pink-400 via-rose-300 to-purple-400'
                  : 'from-violet-400 via-pink-300 to-cyan-400'
              }`}
            >
              Evolve
            </span>
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {mode === 'signup'
              ? 'Create a new account with your preferred styling'
              : mode === 'forgot_password'
              ? 'Reset your account password'
              : 'Sign in to your personal operating system'}
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-slate-700/60 bg-slate-800/60 p-6 shadow-2xl shadow-black/30 backdrop-blur-sm sm:p-8">
          {/* Toast / Status banner */}
          {message && (
            <div
              className={`mb-6 animate-slide-in rounded-xl p-4 text-sm ${
                message.type === 'error'
                  ? 'border border-red-500/30 bg-red-500/10 text-red-300'
                  : message.type === 'info'
                  ? 'border border-blue-500/30 bg-blue-500/10 text-blue-300'
                  : 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              }`}
            >
              <div className="flex items-start gap-3">
                {message.type === 'error' ? (
                  <AlertCircle size={20} className="shrink-0 text-red-400 mt-0.5" />
                ) : message.type === 'info' ? (
                  <HelpCircle size={20} className="shrink-0 text-blue-400 mt-0.5" />
                ) : (
                  <CheckCircle2 size={20} className="shrink-0 text-emerald-400 mt-0.5" />
                )}
                <div className="flex-1 leading-relaxed">{message.text}</div>
              </div>

              {/* Resend button if applicable */}
              {message.canResend && (
                <div className="mt-3 pt-3 border-t border-slate-700/50 flex justify-end">
                  <button
                    type="button"
                    onClick={handleResendConfirmation}
                    disabled={resending}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-400 hover:text-blue-300 disabled:opacity-50"
                  >
                    <Send size={13} />
                    {resending ? 'Sending...' : 'Resend confirmation email'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Mode Tabs */}
          {mode !== 'forgot_password' && (
            <div className="mb-6 flex rounded-xl bg-slate-900/80 p-1 border border-slate-700/50">
              <button
                type="button"
                onClick={() => {
                  setMode('signin');
                  setMessage(null);
                }}
                className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-all ${
                  mode === 'signin'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('signup');
                  setMessage(null);
                }}
                className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-all ${
                  mode === 'signup'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Create Account
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Full Name field (Only in Sign Up) */}
            {mode === 'signup' && (
              <>
                <div>
                  <label htmlFor="fullName" className="mb-1.5 block text-sm font-medium text-slate-300">
                    Full Name
                  </label>
                  <div className="relative">
                    <User
                      size={16}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500"
                    />
                    <input
                      id="fullName"
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Abanoub"
                      autoComplete="name"
                      className="input pl-10"
                    />
                  </div>
                </div>

                {/* Gender / Theme Selection */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-300">
                    Aesthetic Preference
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => handleGenderSelect('female')}
                      className={`flex items-center gap-2.5 rounded-xl border p-3 text-left transition-all active:scale-95 ${
                        gender === 'female'
                          ? 'border-pink-500 bg-pink-500/20 text-pink-200 shadow-lg shadow-pink-500/25 ring-2 ring-pink-500/40'
                          : 'border-slate-700 bg-slate-900/60 text-slate-400 hover:border-pink-500/50 hover:text-pink-300'
                      }`}
                    >
                      <span className="text-2xl">🌸</span>
                      <div>
                        <div className="text-xs font-bold text-white">Female</div>
                        <div className="text-[10px] text-pink-300/80">Soft Rose & Violet</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleGenderSelect('male')}
                      className={`flex items-center gap-2.5 rounded-xl border p-3 text-left transition-all active:scale-95 ${
                        gender === 'male'
                          ? 'border-blue-500 bg-blue-500/20 text-blue-200 shadow-lg shadow-blue-500/25 ring-2 ring-blue-500/40'
                          : 'border-slate-700 bg-slate-900/60 text-slate-400 hover:border-blue-500/50 hover:text-blue-300'
                      }`}
                    >
                      <span className="text-2xl">⚡</span>
                      <div>
                        <div className="text-xs font-bold text-white">Male</div>
                        <div className="text-[10px] text-blue-300/80">Glass UI & Slate</div>
                      </div>
                    </button>
                  </div>
                </div>
              </>
            )}

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
                  placeholder="name@example.com"
                  required
                  autoComplete="email"
                  className="input pl-10"
                />
              </div>
            </div>

            {/* Password field (Hidden in Forgot Password mode) */}
            {mode !== 'forgot_password' && (
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label htmlFor="password" className="text-sm font-medium text-slate-300">
                    Password
                  </label>
                  {mode === 'signin' && (
                    <button
                      type="button"
                      onClick={() => {
                        setMode('forgot_password');
                        setMessage(null);
                      }}
                      className="text-xs text-blue-400 hover:text-blue-300 hover:underline"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
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
                    placeholder={mode === 'signup' ? 'Min 6 characters' : 'Enter password'}
                    required
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
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
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : mode === 'signup' ? (
                <>
                  <UserPlus size={18} />
                  Create Account
                </>
              ) : mode === 'forgot_password' ? (
                <>
                  <Send size={18} />
                  Send Reset Link
                </>
              ) : (
                <>
                  <LogIn size={18} />
                  Sign In
                </>
              )}
            </button>
          </form>

          {/* Forgot password back link */}
          {mode === 'forgot_password' && (
            <div className="mt-5 border-t border-slate-700/50 pt-4 text-center">
              <button
                type="button"
                onClick={() => {
                  setMode('signin');
                  setMessage(null);
                }}
                className="text-xs font-semibold text-blue-400 hover:text-blue-300 hover:underline"
              >
                ← Back to Sign In
              </button>
            </div>
          )}
        </div>

        {/* Footer with Security & Credibility Reassurance */}
        <div className="mt-6 text-center space-y-1">
          <p className="text-xs text-slate-400 font-medium flex items-center justify-center gap-1.5">
            <Lock size={12} className="text-emerald-400" />
            <span>Private & User-Isolated • Supabase RLS Encryption</span>
          </p>
          <p className="text-[11px] text-slate-500">
            Personal Productivity & Finance OS
          </p>
        </div>
      </div>
    </div>
  );
}
