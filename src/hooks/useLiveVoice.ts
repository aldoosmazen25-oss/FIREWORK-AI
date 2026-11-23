import { useCallback, useEffect, useRef, useState } from 'react';
import { getFreshIdToken } from '../lib/firebase';
import type { Language } from '../i18n/translations';

export interface VoiceTranscriptEntry {
  id: string;
  role: 'user' | 'model';
  text: string;
}

function floatTo16BitPcmBase64(input: Float32Array): string {
  const buffer = new ArrayBuffer(input.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < input.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64Pcm16ToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const view = new DataView(bytes.buffer);
  const count = Math.floor(bytes.byteLength / 2);
  const floatData = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    floatData[i] = view.getInt16(i * 2, true) / 32768;
  }
  return floatData;
}

export function useLiveVoice(language: Language) {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'active' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<VoiceTranscriptEntry[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const readyRef = useRef<boolean>(false);

  const stopPlaybackQueue = useCallback(() => {
    for (const src of activeSourcesRef.current) {
      try {
        src.stop();
      } catch {
        // Ignore already stopped sources
      }
    }
    activeSourcesRef.current = [];
    if (outputCtxRef.current) {
      nextStartTimeRef.current = outputCtxRef.current.currentTime;
    }
  }, []);

  const stopSession = useCallback(() => {
    readyRef.current = false;
    stopPlaybackQueue();
    try {
      processorRef.current?.disconnect();
    } catch {
      // Ignore
    }
    processorRef.current = null;

    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }

    if (inputCtxRef.current) {
      inputCtxRef.current.close().catch(() => {});
      inputCtxRef.current = null;
    }
    if (outputCtxRef.current) {
      outputCtxRef.current.close().catch(() => {});
      outputCtxRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setStatus('idle');
  }, [stopPlaybackQueue]);

  const scheduleAudioChunk = useCallback((base64Data: string) => {
    const ctx = outputCtxRef.current;
    if (!ctx) return;
    const pcm = base64Pcm16ToFloat32(base64Data);
    const audioBuffer = ctx.createBuffer(1, pcm.length, 24000);
    audioBuffer.getChannelData(0).set(pcm);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);

    const startAt = Math.max(ctx.currentTime + 0.02, nextStartTimeRef.current);
    source.start(startAt);
    nextStartTimeRef.current = startAt + audioBuffer.duration;
    activeSourcesRef.current.push(source);
    source.onended = () => {
      activeSourcesRef.current = activeSourcesRef.current.filter((s) => s !== source);
    };
  }, []);

  const startSession = useCallback(async () => {
    setError(null);
    setStatus('connecting');

    try {
      const token = await getFreshIdToken();
      if (!token) {
        setStatus('error');
        setError('Sign in with Google before starting a live voice conversation.');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const inputCtx = new AudioContext({ sampleRate: 16000 });
      const outputCtx = new AudioContext({ sampleRate: 24000 });
      inputCtxRef.current = inputCtx;
      outputCtxRef.current = outputCtx;
      nextStartTimeRef.current = outputCtx.currentTime;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws/live`);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'init', token, language }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as {
            type?: string;
            data?: string;
            text?: string;
            message?: string;
          };
          if (msg.type === 'ready') {
            readyRef.current = true;
            setStatus('active');
          } else if (msg.type === 'audio' && msg.data) {
            scheduleAudioChunk(msg.data);
          } else if (msg.type === 'interrupted') {
            stopPlaybackQueue();
          } else if (msg.type === 'input_transcript' && msg.text) {
            setTranscripts((prev) => [
              ...prev.slice(-15),
              { id: `u-${Date.now()}-${Math.random()}`, role: 'user', text: msg.text! },
            ]);
          } else if (msg.type === 'output_transcript' && msg.text) {
            setTranscripts((prev) => [
              ...prev.slice(-15),
              { id: `m-${Date.now()}-${Math.random()}`, role: 'model', text: msg.text! },
            ]);
          } else if (msg.type === 'error') {
            setError(msg.message || 'Voice session error.');
            setStatus('error');
            stopSession();
          } else if (msg.type === 'closed') {
            stopSession();
          }
        } catch {
          // Ignore malformed frame
        }
      };

      ws.onerror = () => {
        setError('Unable to reach the Live Voice bridge.');
        setStatus('error');
        stopSession();
      };

      const source = inputCtx.createMediaStreamSource(stream);
      const processor = inputCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (!readyRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          return;
        }
        const channel = e.inputBuffer.getChannelData(0);
        const base64 = floatTo16BitPcmBase64(channel);
        wsRef.current.send(JSON.stringify({ type: 'audio', audio: base64 }));
      };

      source.connect(processor);
      processor.connect(inputCtx.destination);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Microphone access is required for Live Voice conversations.',
      );
      setStatus('error');
      stopSession();
    }
  }, [language, scheduleAudioChunk, stopPlaybackQueue, stopSession]);

  useEffect(() => {
    return () => {
      stopSession();
    };
  }, [stopSession]);

  return {
    status,
    error,
    transcripts,
    startSession,
    stopSession,
    clearTranscripts: () => setTranscripts([]),
  };
}
