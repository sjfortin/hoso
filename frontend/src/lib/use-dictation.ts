import { useEffect, useRef, useState } from 'react';
type ResultEvent = { resultIndex: number; results: { length: number; [key: number]: { isFinal: boolean; [key: number]: { transcript: string } } } };
interface Recognition {
  lang: string; interimResults: boolean;
  onresult: ((event: ResultEvent) => void) | null; onerror: (() => void) | null; onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
type RecognitionConstructor = new () => Recognition;
const speech = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
const Constructor = speech.SpeechRecognition ?? speech.webkitSpeechRecognition;
export function useDictation(enabled: boolean, onText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState('');
  const current = useRef<Recognition | null>(null);
  const textHandler = useRef(onText); textHandler.current = onText;
  const stop = () => current.current?.stop();
  const start = () => {
    if (!Constructor || !enabled || current.current) return;
    const recognition = new Constructor(); current.current = recognition; let failed = false;
    recognition.lang = navigator.language || 'en-US'; recognition.interimResults = false;
    recognition.onresult = event => {
      if (current.current !== recognition) return;
      const parts = [];
      for (let i = event.resultIndex; i < event.results.length; i++) if (event.results[i].isFinal) parts.push(event.results[i][0].transcript);
      if (parts.length) textHandler.current(parts.join(' '));
    };
    recognition.onerror = () => { failed = true; setStatus('Dictation could not finish. You can type or use your keyboard’s microphone.'); };
    recognition.onend = () => { if (current.current !== recognition) return; current.current = null; setListening(false); if (!failed) setStatus('Dictation finished. Review your text before sending.'); };
    try { recognition.start(); setListening(true); setStatus('Listening… Review your transcript before sending.'); }
    catch { current.current = null; setListening(false); setStatus('Microphone unavailable. You can still type.'); }
  };
  useEffect(() => {
    const cancel = () => {
      if (!current.current) return;
      const recognition = current.current; current.current = null;
      recognition.onresult = null; recognition.onerror = null; recognition.onend = null; recognition.abort(); setListening(false);
    };
    if (!enabled) cancel();
    const visibility = () => { if (document.hidden) current.current?.stop(); };
    document.addEventListener('visibilitychange', visibility);
    return () => { document.removeEventListener('visibilitychange', visibility); cancel(); };
  }, [enabled]);
  return { supported: !!Constructor, listening, status, start, stop };
}
