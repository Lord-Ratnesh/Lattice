import { plain } from '../core/retrieval.js';

/**
 * Browser Web Speech API wrappers for Read Aloud (TTS) and Voice Dictation.
 */

let ttsState = 'idle';
let ttsListener = null;

export function isTtsSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

export function getTtsState() {
  return ttsState;
}

export function onTtsState(fn) {
  ttsListener = fn;
}

function setTtsState(next) {
  ttsState = next;
  ttsListener?.(next);
}

export function speakToggle(text) {
  if (!isTtsSupported()) return;
  const synth = window.speechSynthesis;
  if (ttsState !== 'idle' || synth.speaking) {
    synth.cancel();
    setTtsState('idle');
    return;
  }
  let s = plain(text).replace(/\s+/g, ' ').trim();
  if (!s) return;
  if (s.length > 2500) {
    s = s.slice(0, 2500);
    const cut = s.lastIndexOf('. ');
    if (cut > 800) s = s.slice(0, cut + 1);
  }
  const utter = new SpeechSynthesisUtterance(s);
  utter.onstart = () => setTtsState('speaking');
  utter.onend = () => setTtsState('idle');
  utter.onerror = () => setTtsState('idle');
  setTtsState('speaking');
  synth.speak(utter);
}

export function isDictationSupported() {
  return (
    typeof window !== 'undefined' &&
    Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
  );
}

export function createDictation({ onPartial, onFinal, onState, onError }) {
  if (!isDictationSupported()) return null;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null;
  let active = false;

  const stop = () => {
    if (rec && active) {
      try {
        rec.stop();
      } catch {
        // Ignore stop errors
      }
    }
    active = false;
    onState?.('idle');
  };

  const start = () => {
    if (active) {
      stop();
      return;
    }
    rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = navigator.language || 'en-US';

    rec.onstart = () => {
      active = true;
      onState?.('listening');
    };
    rec.onresult = (ev) => {
      let interim = '';
      let finalChunk = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i];
        if (res.isFinal) finalChunk += res[0].transcript;
        else interim += res[0].transcript;
      }
      if (interim) onPartial?.(interim);
      if (finalChunk) {
        onPartial?.('');
        onFinal?.(finalChunk);
      }
    };
    rec.onerror = (ev) => {
      active = false;
      onPartial?.('');
      onState?.('idle');
      if (ev.error !== 'aborted' && ev.error !== 'no-speech') {
        onError?.(ev.error);
      }
    };
    rec.onend = () => {
      active = false;
      onPartial?.('');
      onState?.('idle');
    };

    try {
      rec.start();
    } catch (err) {
      active = false;
      onState?.('idle');
      onError?.(err?.message || 'dictation_failed');
    }
  };

  return {
    isActive: () => active,
    toggle: () => (active ? stop() : start()),
    stop,
  };
}
