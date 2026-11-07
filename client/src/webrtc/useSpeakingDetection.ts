import { useEffect, useState } from "react";

// A page can only have a handful of AudioContexts before the browser starts
// throwing — a busy voice channel analyses many peers' streams at once, so
// they all share one context and just get their own analyser node.
let sharedAudioContext: AudioContext | null = null;
function getAudioContext(): AudioContext {
  if (!sharedAudioContext) {
    sharedAudioContext = new AudioContext();
  }
  if (sharedAudioContext.state === "suspended") {
    void sharedAudioContext.resume();
  }
  return sharedAudioContext;
}

const SPEAKING_THRESHOLD = 12; // average byte volume, 0-255
const SILENCE_HOLD_MS = 300; // keeps brief dips (consonants, pauses) from flickering the indicator off

export function useSpeakingDetection(stream: MediaStream | null, enabled = true): boolean {
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    if (!stream || !enabled || stream.getAudioTracks().length === 0) {
      setIsSpeaking(false);
      return;
    }

    const audioContext = getAudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.6;
    source.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);
    let rafId: number;
    let silenceTimer: ReturnType<typeof setTimeout> | null = null;
    let speaking = false;

    function tick() {
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      const avg = sum / data.length;

      if (avg > SPEAKING_THRESHOLD) {
        if (silenceTimer) {
          clearTimeout(silenceTimer);
          silenceTimer = null;
        }
        if (!speaking) {
          speaking = true;
          setIsSpeaking(true);
        }
      } else if (speaking && !silenceTimer) {
        silenceTimer = setTimeout(() => {
          speaking = false;
          setIsSpeaking(false);
          silenceTimer = null;
        }, SILENCE_HOLD_MS);
      }

      rafId = requestAnimationFrame(tick);
    }
    tick();

    return () => {
      cancelAnimationFrame(rafId);
      if (silenceTimer) clearTimeout(silenceTimer);
      source.disconnect();
      analyser.disconnect();
    };
  }, [stream, enabled]);

  return isSpeaking;
}
