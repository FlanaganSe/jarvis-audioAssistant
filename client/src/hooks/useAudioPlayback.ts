import { AUDIO } from "@jarvis/shared";
import { useCallback, useRef } from "react";

interface AudioPlaybackControls {
  play: (base64: string) => void;
  stop: () => number;
}

export function useAudioPlayback(): AudioPlaybackControls {
  const contextRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef(0);
  const playbackStartTimeRef = useRef(0);
  const isPlayingRef = useRef(false);
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const generationRef = useRef(0);

  const getContext = useCallback((): AudioContext => {
    if (!contextRef.current || contextRef.current.state === "closed") {
      contextRef.current = new AudioContext({ sampleRate: AUDIO.SAMPLE_RATE });
    }
    return contextRef.current;
  }, []);

  const play = useCallback(
    (base64: string) => {
      const ctx = getContext();
      if (ctx.state === "suspended") {
        ctx.resume();
      }

      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const pcm16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) {
        float32[i] = (pcm16[i] ?? 0) / 32768;
      }

      const buffer = ctx.createBuffer(1, float32.length, AUDIO.SAMPLE_RATE);
      buffer.getChannelData(0).set(float32);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);

      const now = ctx.currentTime;
      if (!isPlayingRef.current || nextPlayTimeRef.current < now) {
        nextPlayTimeRef.current = now + 0.05;
        playbackStartTimeRef.current = now;
        isPlayingRef.current = true;
      }

      source.start(nextPlayTimeRef.current);
      sourcesRef.current.push(source);
      nextPlayTimeRef.current += buffer.duration;

      const gen = generationRef.current;
      source.onended = () => {
        // Ignore stale callbacks from a previous generation (after stop was called)
        if (gen !== generationRef.current) return;
        const idx = sourcesRef.current.indexOf(source);
        if (idx >= 0) sourcesRef.current.splice(idx, 1);
        if (sourcesRef.current.length === 0) {
          isPlayingRef.current = false;
        }
      };
    },
    [getContext],
  );

  const stop = useCallback((): number => {
    const ctx = contextRef.current;
    if (!ctx || !isPlayingRef.current) return 0;

    // Increment generation so stale onended callbacks are ignored
    generationRef.current++;

    const elapsed = ctx.currentTime - playbackStartTimeRef.current;
    const audioPlayedMs = Math.max(0, Math.round(elapsed * 1000));

    for (const source of sourcesRef.current) {
      try {
        source.stop();
      } catch {
        // Already stopped
      }
    }
    sourcesRef.current = [];
    isPlayingRef.current = false;
    nextPlayTimeRef.current = 0;

    return audioPlayedMs;
  }, []);

  return { play, stop };
}
