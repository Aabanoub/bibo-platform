// ============================================================================
// Noise Detector Utility (Web Audio API)
// Measures ambient room noise level to ensure productive study environment.
// ============================================================================

export interface NoiseSampleResult {
  isNoisy: boolean;
  score: number; // 0 to 100%
  averageRms: number;
  peakRms: number;
  samplesTaken: number;
  error?: 'permission_denied' | 'not_supported' | 'device_error' | string;
}

export interface NoiseDetectorOptions {
  sampleDurationMs?: number; // duration to listen (default: 3500ms)
  thresholdScore?: number; // threshold 0-100 (default: 32%)
  noisySamplesRatio?: number; // fraction of samples exceeding threshold to flag as noisy (default: 0.25)
  onProgress?: (currentLevel: number) => void;
}

/**
 * Play a gentle warning chime using Web Audio API (no external asset needed)
 */
export function playNoiseAlertSound() {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    // Beep 1
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(440, now); // A4
    osc1.frequency.exponentialRampToValueAtTime(330, now + 0.25);
    gain1.gain.setValueAtTime(0.18, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.25);

    // Beep 2 (lower tone)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(330, now + 0.28);
    osc2.frequency.exponentialRampToValueAtTime(220, now + 0.55);
    gain2.gain.setValueAtTime(0.15, now + 0.28);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.28);
    osc2.stop(now + 0.55);

    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 700);
  } catch {
    // Ignore audio autoplay restrictions
  }
}

/**
 * Samples the microphone for ambient sound volume for a brief duration (e.g. 3.5 seconds)
 * and determines if the current environment is too noisy for focused studying.
 * Immediately releases the microphone when done.
 */
export async function sampleAmbientNoise(
  options: NoiseDetectorOptions = {}
): Promise<NoiseSampleResult> {
  const {
    sampleDurationMs = 3500,
    thresholdScore = 32,
    noisySamplesRatio = 0.25,
    onProgress,
  } = options;

  if (
    typeof window === 'undefined' ||
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices?.getUserMedia
  ) {
    return {
      isNoisy: false,
      score: 0,
      averageRms: 0,
      peakRms: 0,
      samplesTaken: 0,
      error: 'not_supported',
    };
  }

  let stream: MediaStream | null = null;
  let audioCtx: AudioContext | null = null;

  try {
    // We intentionally disable browser noise suppression and echo cancellation
    // to accurately read the real raw ambient noise of the room!
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });

    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new AudioContextClass();
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }

    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.2;
    source.connect(analyser);

    const dataArray = new Float32Array(analyser.fftSize);
    const samples: number[] = [];
    const intervalMs = 100;
    const totalSamples = Math.max(1, Math.floor(sampleDurationMs / intervalMs));

    return await new Promise<NoiseSampleResult>((resolve) => {
      let count = 0;

      const timer = setInterval(() => {
        analyser.getFloatTimeDomainData(dataArray);

        // Calculate Root Mean Square (RMS)
        let sumSquares = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const val = dataArray[i];
          sumSquares += val * val;
        }
        const rms = Math.sqrt(sumSquares / dataArray.length);

        // Normalize RMS into a 0 - 100 score:
        // Quiet study room: rms is usually 0.005 - 0.025 (score ~ 3 - 15)
        // Whispering / quiet keyboard: rms ~ 0.03 - 0.05 (score ~ 16 - 28)
        // Speaking voice / cafe / TV / street: rms ~ 0.07 - 0.20+ (score ~ 35 - 100)
        const score = Math.min(100, Math.round((rms / 0.16) * 100));

        samples.push(score);
        onProgress?.(score);

        count++;
        if (count >= totalSamples) {
          clearInterval(timer);

          // Stop all mic tracks and close audio context immediately
          try {
            stream?.getTracks().forEach((track) => track.stop());
            audioCtx?.close().catch(() => {});
          } catch {
            // ignore
          }

          const avgScore =
            samples.length > 0
              ? Math.round(samples.reduce((a, b) => a + b, 0) / samples.length)
              : 0;
          const peakScore = samples.length > 0 ? Math.max(...samples) : 0;

          // Fraction of samples that exceeded the threshold
          const noisyCount = samples.filter((s) => s >= thresholdScore).length;
          const noisyFraction = samples.length > 0 ? noisyCount / samples.length : 0;

          // Trigger noise alert if either average is high or sustained chunks were loud
          const isNoisy = noisyFraction >= noisySamplesRatio || avgScore >= thresholdScore;

          resolve({
            isNoisy,
            score: avgScore,
            averageRms: avgScore,
            peakRms: peakScore,
            samplesTaken: samples.length,
          });
        }
      }, intervalMs);
    });
  } catch (err: unknown) {
    try {
      stream?.getTracks().forEach((track) => track.stop());
      audioCtx?.close().catch(() => {});
    } catch {
      // ignore
    }

    const errName = (err as { name?: string })?.name;
    const isPermission =
      errName === 'NotAllowedError' || errName === 'PermissionDeniedError';

    return {
      isNoisy: false,
      score: 0,
      averageRms: 0,
      peakRms: 0,
      samplesTaken: 0,
      error: isPermission ? 'permission_denied' : 'device_error',
    };
  }
}
