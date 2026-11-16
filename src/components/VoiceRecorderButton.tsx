'use client';

import { useState, useRef, useEffect } from 'react';
import { Mic, Square, Loader2 } from 'lucide-react';

interface VoiceRecorderButtonProps {
  onTranscribed: (text: string) => void;
  disabled?: boolean;
  className?: string;
}

export default function VoiceRecorderButton({
  onTranscribed,
  disabled = false,
  className = '',
}: VoiceRecorderButtonProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const startRecording = async () => {
    if (disabled || isRecording || isTranscribing) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      // Determine supported mime type
      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : '';

      const options = mimeType ? { mimeType } : undefined;
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Stop all audio tracks
        stream.getTracks().forEach((track) => track.stop());

        if (timerRef.current) clearInterval(timerRef.current);
        setRecordingSeconds(0);

        const audioBlob = new Blob(audioChunksRef.current, {
          type: mimeType || 'audio/webm',
        });

        if (audioBlob.size === 0) {
          setIsRecording(false);
          return;
        }

        // Send to transcription API
        setIsTranscribing(true);
        try {
          const formData = new FormData();
          const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
          formData.append('file', audioBlob, `recording.${ext}`);

          const res = await fetch('/api/ai/transcribe', {
            method: 'POST',
            body: formData,
          });

          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || 'Failed to transcribe audio');
          }

          const { text } = await res.json();
          if (text) {
            onTranscribed(text);
          }
        } catch (err: any) {
          console.error('Voice transcription error:', err);
          alert(err.message || 'Could not transcribe voice audio.');
        } finally {
          setIsTranscribing(false);
          setIsRecording(false);
        }
      };

      mediaRecorder.start(250); // Collect slices every 250ms
      setIsRecording(true);
      setRecordingSeconds(0);

      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error('Microphone access denied or error:', err);
      alert('Could not access microphone. Please grant microphone permission in your browser.');
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  if (isTranscribing) {
    return (
      <div
        className={`flex items-center gap-1.5 rounded-xl bg-blue-600/20 px-3 py-2 text-xs font-medium text-blue-400 border border-blue-500/30 ${className}`}
      >
        <Loader2 size={16} className="animate-spin text-blue-400" />
        <span>Transcribing...</span>
      </div>
    );
  }

  if (isRecording) {
    return (
      <div
        className={`flex items-center gap-2 rounded-xl bg-red-600/20 px-3 py-2 border border-red-500/40 text-xs font-medium text-red-400 ${className}`}
      >
        <span className="flex h-2.5 w-2.5 relative">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
        </span>
        <span className="font-mono">{formatSeconds(recordingSeconds)}</span>
        <button
          type="button"
          onClick={stopRecording}
          title="Stop and transcribe"
          className="ml-1 rounded-md bg-red-500 p-1 text-white hover:bg-red-600 transition"
        >
          <Square size={13} fill="currentColor" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={startRecording}
      disabled={disabled}
      title="Voice memo (Groq Whisper)"
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-400 transition hover:border-zinc-600 hover:bg-zinc-800 hover:text-white disabled:opacity-40 ${className}`}
    >
      <Mic size={18} />
    </button>
  );
}
