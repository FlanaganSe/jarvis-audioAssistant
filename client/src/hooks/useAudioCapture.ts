import { AUDIO } from "@jarvis/shared";
import { useCallback, useRef, useState } from "react";

interface AudioCaptureControls {
  start: (onChunk: (base64: string) => void) => Promise<void>;
  stop: () => void;
  level: number;
}

export function useAudioCapture(): AudioCaptureControls {
  const contextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const callbackRef = useRef<((base64: string) => void) | null>(null);
  const [level, setLevel] = useState(0);

  const start = useCallback(async (onChunk: (base64: string) => void) => {
    callbackRef.current = onChunk;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: AUDIO.SAMPLE_RATE,
        channelCount: AUDIO.CHANNELS,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });
    streamRef.current = stream;

    const ctx = new AudioContext({ sampleRate: AUDIO.SAMPLE_RATE });
    contextRef.current = ctx;

    // Handle sample rate mismatch: browser may ignore our constraint
    const actualRate = ctx.sampleRate;
    const needsDownsample = actualRate !== AUDIO.SAMPLE_RATE;
    if (needsDownsample) {
      console.warn(
        `AudioContext sample rate is ${actualRate}Hz, expected ${AUDIO.SAMPLE_RATE}Hz. Downsampling will occur.`,
      );
    }

    await ctx.audioWorklet.addModule("/audio-worklet-processor.js");

    const source = ctx.createMediaStreamSource(stream);
    sourceRef.current = source;

    const worklet = new AudioWorkletNode(ctx, "pcm16-capture");
    workletRef.current = worklet;

    worklet.port.onmessage = (
      event: MessageEvent<ArrayBuffer | { type: string; level: number }>,
    ) => {
      // Handle level messages from the worklet
      if (event.data && typeof event.data === "object" && "type" in event.data) {
        const msg = event.data as { type: string; level: number };
        if (msg.type === "level") {
          setLevel(msg.level);
        }
        return;
      }

      let pcm16 = new Int16Array(event.data as ArrayBuffer);

      // Downsample if needed (e.g. 48kHz → 24kHz by skipping every other sample)
      if (needsDownsample) {
        const ratio = Math.round(actualRate / AUDIO.SAMPLE_RATE);
        const downsampled = new Int16Array(Math.floor(pcm16.length / ratio));
        for (let i = 0; i < downsampled.length; i++) {
          downsampled[i] = pcm16[i * ratio] ?? 0;
        }
        pcm16 = downsampled;
      }

      // Convert to base64
      const bytes = new Uint8Array(pcm16.buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i] ?? 0);
      }
      callbackRef.current?.(btoa(binary));
    };

    source.connect(worklet);
    worklet.connect(ctx.destination); // Required to keep the worklet running
  }, []);

  const stop = useCallback(() => {
    workletRef.current?.disconnect();
    sourceRef.current?.disconnect();
    for (const track of streamRef.current?.getTracks() ?? []) {
      track.stop();
    }
    // Don't close AudioContext — reuse for playback
    workletRef.current = null;
    sourceRef.current = null;
    streamRef.current = null;
    callbackRef.current = null;
    setLevel(0);
  }, []);

  return { start, stop, level };
}
