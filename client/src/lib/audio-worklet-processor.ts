// AudioWorklet processor — runs in a separate thread
// Captures Float32 microphone input, converts to PCM16 Int16, posts to main thread

class PCM16CaptureProcessor extends AudioWorkletProcessor {
  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0]?.[0];
    if (!input || input.length === 0) return true;

    const pcm16 = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const sample = input[i] ?? 0;
      const s = Math.max(-1, Math.min(1, sample));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }

    this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
    return true;
  }
}

registerProcessor("pcm16-capture", PCM16CaptureProcessor);
