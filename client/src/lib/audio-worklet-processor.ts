// AudioWorklet processor — runs in a separate thread
// Captures Float32 microphone input, converts to PCM16 Int16, posts to main thread
// Also computes RMS level for visualization

class PCM16CaptureProcessor extends AudioWorkletProcessor {
  private frameCount = 0;

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0]?.[0];
    if (!input || input.length === 0) return true;

    const pcm16 = new Int16Array(input.length);
    let sumSquares = 0;
    for (let i = 0; i < input.length; i++) {
      const sample = input[i] ?? 0;
      sumSquares += sample * sample;
      const s = Math.max(-1, Math.min(1, sample));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }

    this.port.postMessage(pcm16.buffer, [pcm16.buffer]);

    // Send RMS level every ~4 frames (~50ms at 128 samples/frame @ 24kHz)
    this.frameCount++;
    if (this.frameCount % 4 === 0) {
      const rms = Math.sqrt(sumSquares / input.length);
      this.port.postMessage({ type: "level", level: Math.min(1, rms * 3) });
    }

    return true;
  }
}

registerProcessor("pcm16-capture", PCM16CaptureProcessor);
