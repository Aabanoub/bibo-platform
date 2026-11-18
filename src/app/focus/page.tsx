'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase';
import { Task } from '@/types';
import {
  Timer,
  Play,
  Pause,
  RotateCcw,
  SkipForward,
  CheckCircle2,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Sparkles,
  Flame,
  Award,
  Settings2,
  Minus,
  Plus,
  X,
  Check,
  RotateCcw as ResetIcon,
} from 'lucide-react';

type Mode = 'focus' | 'shortBreak' | 'longBreak';

interface Durations {
  focus: number;      // seconds
  shortBreak: number; // seconds
  longBreak: number;  // seconds
}

const DEFAULT_DURATIONS: Durations = {
  focus: 25 * 60,
  shortBreak: 5 * 60,
  longBreak: 15 * 60,
};

// ---------------------------------------------------------------------------
// Web Audio API Synthesizer (Chime & Ambient Noise Generator)
// ---------------------------------------------------------------------------
class SoundEngine {
  private ctx: AudioContext | null = null;
  private noiseNode: AudioNode | null = null;
  private gainNode: GainNode | null = null;

  private initCtx() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // Play pleasant completion chime
  playChime() {
    try {
      this.initCtx();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      // Harmonic chord: C5 (523.25) -> G5 (783.99)
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.3);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.3, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 1.2);
    } catch (e) {
      console.warn('Could not play chime:', e);
    }
  }

  // Generate continuous calming pink/rain noise
  startAmbient(type: 'rain' | 'white' = 'rain') {
    try {
      this.initCtx();
      if (!this.ctx) return;
      this.stopAmbient();

      const bufferSize = this.ctx.sampleRate * 2;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);

      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        if (type === 'rain') {
          // Pink noise filter approximation
          b0 = 0.99886 * b0 + white * 0.0555179;
          b1 = 0.99332 * b1 + white * 0.0750759;
          b2 = 0.96900 * b2 + white * 0.1538520;
          b3 = 0.86650 * b3 + white * 0.3104856;
          b4 = 0.55000 * b4 + white * 0.5329522;
          b5 = -0.7616 * b5 - white * 0.0168980;
          data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.04;
          b6 = white * 0.115926;
        } else {
          data[i] = white * 0.03;
        }
      }

      const noiseSource = this.ctx.createBufferSource();
      noiseSource.buffer = buffer;
      noiseSource.loop = true;

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.05, this.ctx.currentTime);

      noiseSource.connect(gain);
      gain.connect(this.ctx.destination);

      noiseSource.start();
      this.noiseNode = noiseSource;
      this.gainNode = gain;
    } catch (e) {
      console.warn('Could not start ambient sound:', e);
    }
  }

  stopAmbient() {
    try {
      if (this.noiseNode) {
        (this.noiseNode as any).stop?.();
        this.noiseNode.disconnect();
        this.noiseNode = null;
      }
      if (this.gainNode) {
        this.gainNode.disconnect();
        this.gainNode = null;
      }
    } catch (e) {
      console.warn('Could not stop ambient sound:', e);
    }
  }
}

export default function FocusPage() {
  const supabase = createClient();
  const soundEngineRef = useRef<SoundEngine | null>(null);

  // Custom durations state
  const [durations, setDurations] = useState<Durations>(DEFAULT_DURATIONS);
  const [mode, setMode] = useState<Mode>('focus');
  const [timeLeft, setTimeLeft] = useState(DEFAULT_DURATIONS.focus);
  const [isRunning, setIsRunning] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [completedSessions, setCompletedSessions] = useState(0);

  // Settings modal state
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tempFocusMins, setTempFocusMins] = useState(25);
  const [tempShortBreakMins, setTempShortBreakMins] = useState(5);
  const [tempLongBreakMins, setTempLongBreakMins] = useState(15);

  // Tasks integration
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');

  // Load custom durations from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('bibo_focus_durations');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.focus && parsed.shortBreak && parsed.longBreak) {
          const loaded: Durations = {
            focus: Math.max(60, Number(parsed.focus) || 25 * 60),
            shortBreak: Math.max(60, Number(parsed.shortBreak) || 5 * 60),
            longBreak: Math.max(60, Number(parsed.longBreak) || 15 * 60),
          };
          setDurations(loaded);
          setTimeLeft(loaded.focus);
          setTempFocusMins(Math.round(loaded.focus / 60));
          setTempShortBreakMins(Math.round(loaded.shortBreak / 60));
          setTempLongBreakMins(Math.round(loaded.longBreak / 60));
        }
      }
    } catch (e) {
      console.warn('Could not load custom focus durations:', e);
    }
  }, []);

  useEffect(() => {
    soundEngineRef.current = new SoundEngine();
    return () => {
      soundEngineRef.current?.stopAmbient();
    };
  }, []);

  // Load active tasks
  useEffect(() => {
    async function loadTasks() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const lastResetAt =
        user.user_metadata?.last_data_reset_at ||
        (typeof window !== 'undefined' ? localStorage.getItem('bibo_last_reset_at') : null);

      let query = supabase
        .from('tasks')
        .select('*')
        .eq('user_id', user.id)
        .neq('status', 'done');

      if (lastResetAt) {
        query = query.gt('created_at', lastResetAt);
      }

      const { data } = await query.order('priority', { ascending: false });

      if (data) {
        setTasks(data);
        if (data.length > 0) {
          setSelectedTaskId(data[0].id);
        }
      }
    }
    loadTasks();
  }, [supabase]);

  // Handle Timer ticking
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (isRunning && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (isRunning && timeLeft === 0) {
      // Completed session!
      handleSessionComplete();
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRunning, timeLeft]);

  // Handle ambient sound toggle
  useEffect(() => {
    if (soundEnabled && isRunning && mode === 'focus') {
      soundEngineRef.current?.startAmbient('rain');
    } else {
      soundEngineRef.current?.stopAmbient();
    }
  }, [soundEnabled, isRunning, mode]);

  const handleSessionComplete = () => {
    setIsRunning(false);
    soundEngineRef.current?.playChime();

    if (mode === 'focus') {
      setCompletedSessions((c) => c + 1);
      const nextMode = (completedSessions + 1) % 4 === 0 ? 'longBreak' : 'shortBreak';
      setMode(nextMode);
      setTimeLeft(durations[nextMode]);
    } else {
      setMode('focus');
      setTimeLeft(durations.focus);
    }
  };

  const switchMode = (newMode: Mode) => {
    setMode(newMode);
    setIsRunning(false);
    setTimeLeft(durations[newMode]);
  };

  const toggleTimer = () => {
    setIsRunning((prev) => !prev);
  };

  const resetTimer = () => {
    setIsRunning(false);
    setTimeLeft(durations[mode]);
  };

  const skipTimer = () => {
    resetTimer();
    handleSessionComplete();
  };

  const openSettings = () => {
    setTempFocusMins(Math.round(durations.focus / 60));
    setTempShortBreakMins(Math.round(durations.shortBreak / 60));
    setTempLongBreakMins(Math.round(durations.longBreak / 60));
    setSettingsOpen(true);
  };

  const saveSettings = () => {
    const focusSec = Math.max(1, Math.min(180, Number(tempFocusMins) || 25)) * 60;
    const shortSec = Math.max(1, Math.min(60, Number(tempShortBreakMins) || 5)) * 60;
    const longSec = Math.max(1, Math.min(90, Number(tempLongBreakMins) || 15)) * 60;

    const newDurations: Durations = {
      focus: focusSec,
      shortBreak: shortSec,
      longBreak: longSec,
    };

    setDurations(newDurations);
    try {
      localStorage.setItem('bibo_focus_durations', JSON.stringify(newDurations));
    } catch {}

    if (!isRunning) {
      setTimeLeft(newDurations[mode]);
    }
    setSettingsOpen(false);
  };

  const resetToDefaultDurations = () => {
    setTempFocusMins(25);
    setTempShortBreakMins(5);
    setTempLongBreakMins(15);
  };

  const markTaskDone = async () => {
    if (!selectedTaskId) return;

    await supabase
      .from('tasks')
      .update({ status: 'done', updated_at: new Date().toISOString() })
      .eq('id', selectedTaskId);

    setTasks((prev) => prev.filter((t) => t.id !== selectedTaskId));
    setSelectedTaskId(tasks.find((t) => t.id !== selectedTaskId)?.id || '');
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Format MM:SS
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const timeFormatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  // Progress percentage
  const totalDuration = durations[mode];
  const progressPercent = ((totalDuration - timeLeft) / totalDuration) * 100;

  const currentTask = tasks.find((t) => t.id === selectedTaskId);

  return (
    <div
      className={`flex flex-col text-zinc-100 transition-colors ${
        mode === 'focus'
          ? 'selection:bg-blue-600'
          : 'selection:bg-emerald-600'
      }`}
    >
      {/* Top Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-rose-500 text-white shadow-lg shadow-amber-500/20">
            <Flame size={20} />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight">Focus Mode</h1>
            <p className="text-xs text-zinc-400">Deep Work Pomodoro & Ambient Sound</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Custom Durations Button */}
          <button
            onClick={openSettings}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white transition active:scale-95"
            title="Adjust focus and break durations"
          >
            <Settings2 size={15} className="text-amber-400" />
            <span>Customize Time</span>
          </button>

          {/* Ambient Sound Toggle */}
          <button
            onClick={() => setSoundEnabled((v) => !v)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              soundEnabled
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white'
            }`}
            title="Toggle calming rain sound during focus"
          >
            {soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
            <span className="hidden sm:inline">Rain Sound</span>
          </button>

          {/* Fullscreen Toggle */}
          <button
            onClick={toggleFullscreen}
            className="rounded-lg border border-zinc-800 bg-zinc-900 p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white transition"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </header>

      {/* Main Focus Area */}
      <main className="flex flex-1 flex-col items-center justify-center p-6 text-center">
        <div className="w-full max-w-md space-y-8">
          {/* Mode Switcher Tabs */}
          <div className="flex rounded-2xl border border-zinc-800 bg-zinc-900/80 p-1 backdrop-blur-sm">
            {(
              [
                { id: 'focus', label: `Deep Focus (${Math.round(durations.focus / 60)}m)` },
                { id: 'shortBreak', label: `Short Break (${Math.round(durations.shortBreak / 60)}m)` },
                { id: 'longBreak', label: `Long Break (${Math.round(durations.longBreak / 60)}m)` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => switchMode(tab.id)}
                className={`flex-1 rounded-xl py-2 text-xs font-semibold transition ${
                  mode === tab.id
                    ? tab.id === 'focus'
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-emerald-600 text-white shadow-md'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Circular Countdown Ring */}
          <div className="relative mx-auto flex h-72 w-72 items-center justify-center">
            <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 100 100">
              {/* Background ring */}
              <circle
                cx="50"
                cy="50"
                r="42"
                className="stroke-zinc-800"
                strokeWidth="5"
                fill="none"
              />
              {/* Progress ring */}
              <circle
                cx="50"
                cy="50"
                r="42"
                className={`transition-all duration-1000 ease-linear ${
                  mode === 'focus' ? 'stroke-blue-500' : 'stroke-emerald-500'
                }`}
                strokeWidth="5"
                strokeDasharray="264"
                strokeDashoffset={264 - (264 * progressPercent) / 100}
                strokeLinecap="round"
                fill="none"
              />
            </svg>

            {/* Inner Content */}
            <div className="absolute flex flex-col items-center justify-center">
              <span className="font-mono text-5xl font-bold tracking-tight text-white">
                {timeFormatted}
              </span>
              <span className="mt-2 text-xs font-medium uppercase tracking-wider text-zinc-400">
                {isRunning ? (mode === 'focus' ? '⚡ In Deep Work' : '☕ Relaxing') : 'Paused'}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={resetTimer}
              className="flex h-12 w-12 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-white transition"
              title="Reset Timer"
            >
              <ResetIcon size={18} />
            </button>

            <button
              onClick={toggleTimer}
              className={`flex h-16 w-28 items-center justify-center gap-2 rounded-2xl text-base font-bold shadow-xl transition active:scale-95 ${
                isRunning
                  ? 'bg-zinc-800 text-white hover:bg-zinc-700'
                  : mode === 'focus'
                  ? 'bg-blue-600 text-white hover:bg-blue-500 shadow-blue-500/20'
                  : 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-emerald-500/20'
              }`}
            >
              {isRunning ? (
                <>
                  <Pause size={20} />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play size={20} className="fill-current" />
                  <span>Start</span>
                </>
              )}
            </button>

            <button
              onClick={skipTimer}
              className="flex h-12 w-12 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-white transition"
              title="Skip Session"
            >
              <SkipForward size={18} />
            </button>
          </div>

          {/* Linked Task Selector */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 text-left">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Current Goal / Task
              </span>
              {currentTask && (
                <button
                  onClick={markTaskDone}
                  className="flex items-center gap-1 text-xs font-medium text-emerald-400 hover:text-emerald-300 transition"
                >
                  <CheckCircle2 size={13} />
                  <span>Mark Done</span>
                </button>
              )}
            </div>

            {tasks.length > 0 ? (
              <select
                value={selectedTaskId}
                onChange={(e) => setSelectedTaskId(e.target.value)}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3.5 py-2.5 text-xs text-zinc-100 outline-none focus:border-blue-500"
              >
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    [{t.priority.toUpperCase()}] {t.title}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-zinc-500">
                No active tasks pending. Great job staying on top of your work!
              </p>
            )}
          </div>

          {/* Completed Sessions Stat */}
          <div className="flex items-center justify-center gap-2 text-xs text-zinc-400">
            <Award size={16} className="text-amber-400" />
            <span>
              <strong>{completedSessions}</strong> Pomodoros completed today ({completedSessions * Math.round(durations.focus / 60)} mins of focus)
            </span>
          </div>
        </div>
      </main>

      {/* Customize Timer Modal */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl space-y-5 text-left animate-scale-in">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400">
                  <Settings2 size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Timer Durations</h3>
                  <p className="text-xs text-zinc-400">Adjust focus and break lengths in minutes</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* 1. Focus Time */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-zinc-200">Deep Focus Duration:</span>
                <span className="font-bold text-blue-400 text-sm">{tempFocusMins} min</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTempFocusMins((v) => Math.max(1, v - 5))}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition active:scale-95"
                >
                  <Minus size={14} />
                </button>
                <input
                  type="number"
                  min="1"
                  max="180"
                  value={tempFocusMins}
                  onChange={(e) => setTempFocusMins(Math.max(1, Math.min(180, parseInt(e.target.value) || 1)))}
                  className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-center text-sm font-bold text-white outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={() => setTempFocusMins((v) => Math.min(180, v + 5))}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition active:scale-95"
                >
                  <Plus size={14} />
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[15, 20, 25, 45, 50, 60, 90].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setTempFocusMins(m)}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
                      tempFocusMins === m
                        ? 'bg-blue-600 text-white font-bold'
                        : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
                    }`}
                  >
                    {m}m
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Short Break */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-zinc-200">Short Break Duration:</span>
                <span className="font-bold text-emerald-400 text-sm">{tempShortBreakMins} min</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTempShortBreakMins((v) => Math.max(1, v - 1))}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition active:scale-95"
                >
                  <Minus size={14} />
                </button>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={tempShortBreakMins}
                  onChange={(e) => setTempShortBreakMins(Math.max(1, Math.min(60, parseInt(e.target.value) || 1)))}
                  className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-center text-sm font-bold text-white outline-none focus:border-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => setTempShortBreakMins((v) => Math.min(60, v + 1))}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition active:scale-95"
                >
                  <Plus size={14} />
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[3, 5, 7, 10, 15].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setTempShortBreakMins(m)}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
                      tempShortBreakMins === m
                        ? 'bg-emerald-600 text-white font-bold'
                        : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
                    }`}
                  >
                    {m}m
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Long Break */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-zinc-200">Long Break Duration (every 4 sessions):</span>
                <span className="font-bold text-teal-400 text-sm">{tempLongBreakMins} min</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTempLongBreakMins((v) => Math.max(1, v - 5))}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition active:scale-95"
                >
                  <Minus size={14} />
                </button>
                <input
                  type="number"
                  min="1"
                  max="90"
                  value={tempLongBreakMins}
                  onChange={(e) => setTempLongBreakMins(Math.max(1, Math.min(90, parseInt(e.target.value) || 1)))}
                  className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-center text-sm font-bold text-white outline-none focus:border-teal-500"
                />
                <button
                  type="button"
                  onClick={() => setTempLongBreakMins((v) => Math.min(90, v + 5))}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition active:scale-95"
                >
                  <Plus size={14} />
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[10, 15, 20, 25, 30].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setTempLongBreakMins(m)}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
                      tempLongBreakMins === m
                        ? 'bg-teal-600 text-white font-bold'
                        : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
                    }`}
                  >
                    {m}m
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
              <button
                type="button"
                onClick={resetToDefaultDurations}
                className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition"
              >
                <ResetIcon size={13} />
                <span>Defaults (25/5/15)</span>
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSettingsOpen(false)}
                  className="rounded-xl border border-zinc-700 bg-zinc-800 px-3.5 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveSettings}
                  className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-blue-500/20 hover:bg-blue-500 transition active:scale-95"
                >
                  <Check size={14} />
                  <span>Save & Apply</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
