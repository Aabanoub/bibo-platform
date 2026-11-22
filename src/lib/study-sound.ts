// ============================================================================
// Study & Break Audio Alarms (Web Audio API Synthesizers)
// Pure browser-synthesized alarms: 100% offline, zero external audio assets.
// ============================================================================

/**
 * Play a rich, celebratory, multi-tone chime alarm when an active study session finishes.
 */
export function playStudyFinishedAlarm() {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') ctx.resume();

    const now = ctx.currentTime;

    // Celebratory ascending chime (C5 -> E5 -> G5 -> C6) followed by dual bell chords
    const notes = [
      { freq: 523.25, time: 0.0, dur: 0.35, gain: 0.3 }, // C5
      { freq: 659.25, time: 0.18, dur: 0.35, gain: 0.32 }, // E5
      { freq: 783.99, time: 0.36, dur: 0.4, gain: 0.35 }, // G5
      { freq: 1046.5, time: 0.54, dur: 0.85, gain: 0.4 }, // C6

      // Repeating celebratory double-ring
      { freq: 880.0, time: 1.15, dur: 0.32, gain: 0.32 }, // A5
      { freq: 1046.5, time: 1.4, dur: 0.85, gain: 0.38 }, // C6
      { freq: 880.0, time: 2.05, dur: 0.32, gain: 0.32 }, // A5
      { freq: 1046.5, time: 2.3, dur: 1.1, gain: 0.4 }, // C6
    ];

    notes.forEach(({ freq, time, dur, gain: vol }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + time);

      gain.gain.setValueAtTime(0, now + time);
      gain.gain.linearRampToValueAtTime(vol, now + time + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + time + dur);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + time);
      osc.stop(now + time + dur);
    });

    // Mobile / Browser vibration
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([250, 100, 250, 100, 400]);
      } catch {
        // ignore
      }
    }

    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 3800);
  } catch (e) {
    console.warn('Could not play study finished alarm:', e);
  }
}

/**
 * Play an alert, energetic wake-up alarm when a break finishes.
 * Warns user to return to their study session.
 */
export function playBreakFinishedAlarm() {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') ctx.resume();

    const now = ctx.currentTime;

    // Rhythmic energetic wake-up pulses: Beep-Beep-Beep!
    const pulses = [
      // Pulse 1
      { freq: 659.25, time: 0.0, dur: 0.18, type: 'triangle' as OscillatorType, gain: 0.32 },
      { freq: 880.0, time: 0.15, dur: 0.28, type: 'sine' as OscillatorType, gain: 0.35 },

      // Pulse 2
      { freq: 659.25, time: 0.55, dur: 0.18, type: 'triangle' as OscillatorType, gain: 0.32 },
      { freq: 880.0, time: 0.7, dur: 0.28, type: 'sine' as OscillatorType, gain: 0.35 },

      // Pulse 3
      { freq: 659.25, time: 1.1, dur: 0.18, type: 'triangle' as OscillatorType, gain: 0.32 },
      { freq: 1046.5, time: 1.25, dur: 0.55, type: 'sine' as OscillatorType, gain: 0.4 },

      // Pulse 4 final alert
      { freq: 880.0, time: 1.85, dur: 0.18, type: 'triangle' as OscillatorType, gain: 0.32 },
      { freq: 1046.5, time: 2.05, dur: 0.8, type: 'sine' as OscillatorType, gain: 0.42 },
    ];

    pulses.forEach(({ freq, time, dur, type, gain: vol }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now + time);

      gain.gain.setValueAtTime(0, now + time);
      gain.gain.linearRampToValueAtTime(vol, now + time + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + time + dur);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + time);
      osc.stop(now + time + dur);
    });

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([150, 80, 150, 80, 300, 100, 400]);
      } catch {
        // ignore
      }
    }

    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 3500);
  } catch (e) {
    console.warn('Could not play break finished alarm:', e);
  }
}
