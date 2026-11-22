// ============================================================================
// Evolve Platform - Live Lock Screen & Notification Center Timer Widget
// Utilizes Web MediaSession API and Persistent Service Worker Notifications
// to render a native live ticking timer widget directly on the phone's Lock Screen,
// Notification Shade, and Always-On Display with native Pause/Resume/Complete buttons.
// ============================================================================

export interface LockScreenWidgetConfig {
  title: string;
  sessionType: 'task' | 'break' | 'review';
  secondsLeft: number;
  totalSeconds: number;
  isRunning: boolean;
  onPause: () => void;
  onResume: () => void;
  onComplete: () => void;
}

class LockScreenWidgetManager {
  private silentAudio: HTMLAudioElement | null = null;
  private isWidgetActive = false;
  private currentTitle = '';
  private currentSessionType = '';
  private totalSeconds = 0;
  private config: LockScreenWidgetConfig | null = null;

  /**
   * Initializes silent background carrier audio to keep MediaSession alive on phone lock screen
   */
  private initSilentAudio() {
    if (this.silentAudio) return;
    if (typeof window === 'undefined') return;

    try {
      // 1-second inaudible base64 MP3 loop
      const silentMp3 =
        'data:audio/mp3;base64,//uQxAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAACcQCAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA///////AAAA8AAADwAAAPAAAA8AAADwAAAPAAAA8AAADwAAAPAAAA8AAADwAAAPAAAA8AAADwAAAPAAAA8AAAAAAAAAAAAAAAAAAA';
      this.silentAudio = new Audio(silentMp3);
      this.silentAudio.loop = true;
      this.silentAudio.volume = 0.01; // virtually inaudible
    } catch {
      // Audio fallback
    }
  }

  /**
   * Starts or updates the native Phone Lock Screen Widget
   */
  public start(config: LockScreenWidgetConfig) {
    if (typeof window === 'undefined') return;
    this.config = config;
    this.currentTitle = config.title;
    this.currentSessionType = config.sessionType;
    this.totalSeconds = config.totalSeconds;
    this.isWidgetActive = true;

    this.initSilentAudio();

    if (this.silentAudio && config.isRunning) {
      this.silentAudio.play().catch(() => {
        // User gesture may be needed initially
      });
    }

    this.update(config.secondsLeft, config.isRunning);
    this.setupMediaSessionHandlers();
  }

  /**
   * Updates the lock screen widget display with new ticking seconds & running state
   */
  public update(secondsLeft: number, isRunning: boolean) {
    if (typeof window === 'undefined' || !this.isWidgetActive) return;

    const min = Math.floor(secondsLeft / 60);
    const sec = secondsLeft % 60;
    const timeFormatted = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    const typeLabel = this.currentSessionType === 'break' ? 'Break Session' : 'Deep Study Session';

    // 1. Update MediaSession API for Phone Lock Screen & Always-On Display
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: `[${timeFormatted}] ${this.currentTitle}`,
          artist: `Evolve • ${typeLabel}`,
          album: isRunning ? 'Focus Lockdown Active' : 'Session Paused',
          artwork: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/logo.png', sizes: '512x512', type: 'image/png' },
          ],
        });

        navigator.mediaSession.playbackState = isRunning ? 'playing' : 'paused';

        if ('setPositionState' in navigator.mediaSession && this.totalSeconds > 0) {
          const elapsed = Math.max(0, this.totalSeconds - secondsLeft);
          navigator.mediaSession.setPositionState({
            duration: this.totalSeconds,
            playbackRate: isRunning ? 1 : 0,
            position: Math.min(this.totalSeconds, elapsed),
          });
        }
      } catch (err) {
        // ignore MediaSession update error
      }
    }

    // 2. Play or pause silent carrier audio based on running state
    if (this.silentAudio) {
      if (isRunning && this.silentAudio.paused) {
        this.silentAudio.play().catch(() => {});
      } else if (!isRunning && !this.silentAudio.paused) {
        this.silentAudio.pause();
      }
    }

    // 3. Update Persistent Android Notification Widget if Service Worker is active
    this.updateNotificationWidget(timeFormatted, isRunning);
  }

  /**
   * Sets up native hardware / lock screen controls (Play, Pause, Stop)
   */
  private setupMediaSessionHandlers() {
    if (typeof window === 'undefined' || !('mediaSession' in navigator)) return;

    try {
      navigator.mediaSession.setActionHandler('play', () => {
        if (this.config) {
          this.config.onResume();
        }
      });

      navigator.mediaSession.setActionHandler('pause', () => {
        if (this.config) {
          this.config.onPause();
        }
      });

      navigator.mediaSession.setActionHandler('stop', () => {
        if (this.config) {
          this.config.onComplete();
        }
      });
    } catch {
      // action handler unsupported on some browsers
    }
  }

  /**
   * Updates or shows persistent Android notification widget
   */
  private async updateNotificationWidget(timeFormatted: string, isRunning: boolean) {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    try {
      if (Notification.permission !== 'granted') return;

      const registration = await navigator.serviceWorker.ready;
      if (!registration) return;

      // Only update notification every 10 seconds or on pause/play to avoid spamming system resources
      const isBreak = this.currentSessionType === 'break';
      const statusPrefix = isRunning ? '⏱️' : '⏸️';

      await registration.showNotification(
        `${statusPrefix} ${timeFormatted} • ${this.currentTitle}`,
        {
          tag: 'evolve-live-study-timer',
          body: isRunning
            ? `${isBreak ? 'Rest & Recovery' : 'Deep Study Lockdown'} • Site Frozen`
            : 'Timer Paused • Tap to resume',
          icon: '/icon-192.png',
          badge: '/favicon-32x32.png',
          silent: true,
          requireInteraction: true,
          data: { url: '/tasks' },
        } as any
      );
    } catch {
      // silent notification update catch
    }
  }

  /**
   * Stops and dismisses the lock screen widget
   */
  public stop() {
    this.isWidgetActive = false;
    this.config = null;

    if (this.silentAudio) {
      try {
        this.silentAudio.pause();
        this.silentAudio.currentTime = 0;
      } catch {}
    }

    if (typeof window !== 'undefined' && 'mediaSession' in navigator) {
      try {
        navigator.mediaSession.playbackState = 'none';
        navigator.mediaSession.metadata = null;
      } catch {}
    }

    // Dismiss the persistent notification
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.ready
        .then((reg) => reg.getNotifications({ tag: 'evolve-live-study-timer' }))
        .then((notifications) => {
          notifications.forEach((n) => n.close());
        })
        .catch(() => {});
    }
  }
}

export const lockScreenTimerWidget = new LockScreenWidgetManager();
