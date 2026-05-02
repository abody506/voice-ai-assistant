"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Mic, MicOff, Volume2, VolumeX, Wifi, WifiOff,
  Code2, Eye, Loader2, Sparkles, RefreshCw, Copy, Check,
} from "lucide-react";

type AppStatus = "idle" | "listening" | "processing" | "speaking" | "error" | "paused";
interface GenerateResponse { spoken_summary: string; html_code: string; error?: string; }

/* ── Speech Recognition type shim ── */
interface SpeechRecognitionEvent extends Event {
  resultIndex: number; results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEvent extends Event { error: string; }
interface SpeechRecognitionResultList {
  length: number; item(i: number): SpeechRecognitionResult; [i: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionResult {
  isFinal: boolean; length: number;
  item(i: number): SpeechRecognitionAlternative; [i: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionAlternative { transcript: string; confidence: number; }
interface SpeechRecognition extends EventTarget {
  continuous: boolean; interimResults: boolean; lang: string; maxAlternatives: number;
  onstart: ((ev: Event) => void) | null;
  onend:   ((ev: Event) => void) | null;
  onresult:((ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((ev: SpeechRecognitionErrorEvent) => void) | null;
  start(): void; stop(): void; abort(): void;
}
declare let SpeechRecognition: { new(): SpeechRecognition };
declare global {
  interface Window {
    SpeechRecognition: typeof SpeechRecognition;
    webkitSpeechRecognition: typeof SpeechRecognition;
  }
}

const PLACEHOLDER = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<script src="https://cdn.tailwindcss.com"></script><title>Preview</title></head>
<body class="bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 min-h-screen flex items-center justify-center">
<div class="text-center space-y-6 px-8">
  <div class="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center shadow-2xl">
    <svg xmlns="http://www.w3.org/2000/svg" class="w-12 h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/>
    </svg>
  </div>
  <h1 class="text-4xl font-bold text-white">Voice AI Assistant</h1>
  <p class="text-purple-300 text-lg max-w-md mx-auto">Click the microphone and describe what you want to build.</p>
  <div class="flex flex-wrap justify-center gap-3 text-sm text-slate-400">
    <span class="px-3 py-1 rounded-full bg-slate-800 border border-slate-700">"Build a login form"</span>
    <span class="px-3 py-1 rounded-full bg-slate-800 border border-slate-700">"Create a pricing card"</span>
    <span class="px-3 py-1 rounded-full bg-slate-800 border border-slate-700">"Make a navbar"</span>
  </div>
</div></body></html>`;

function MicVisualizer({ status }: { status: AppStatus }) {
  const active = status === "listening";
  const proc   = status === "processing";
  const speak  = status === "speaking";
  return (
    <div className="relative flex items-center justify-center w-40 h-40">
      {active && <>
        <span className="mic-ring absolute inset-0 rounded-full bg-violet-500/20"/>
        <span className="mic-ring-2 absolute inset-0 rounded-full bg-violet-500/15"/>
        <span className="mic-ring-3 absolute inset-0 rounded-full bg-violet-500/10"/>
      </>}
      <div className={`relative z-10 w-24 h-24 rounded-full flex items-center justify-center transition-all duration-500 shadow-2xl
        ${active ? "bg-gradient-to-br from-violet-500 to-purple-700 shadow-violet-500/50 scale-110"
        : proc   ? "bg-gradient-to-br from-amber-500 to-orange-600 shadow-amber-500/40"
        : speak  ? "bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-500/40"
        :          "bg-gradient-to-br from-slate-600 to-slate-700"}`}>
        {proc   ? <Loader2 className="w-10 h-10 text-white animate-spin"/>
        : speak ? <Volume2 className="w-10 h-10 text-white animate-pulse"/>
        : active? <Mic     className="w-10 h-10 text-white"/>
        :         <MicOff  className="w-10 h-10 text-slate-400"/>}
      </div>
      {active && (
        <div className="absolute -bottom-8 flex items-end gap-1 h-8">
          {Array.from({length:9}).map((_,i)=>(
            <div key={i} className="wave-bar w-1.5 rounded-full bg-violet-400"/>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: AppStatus }) {
  const m: Record<AppStatus,{label:string;color:string;dot:string}> = {
    idle:       {label:"Idle",        color:"text-slate-400", dot:"bg-slate-500"},
    listening:  {label:"Listening…",  color:"text-violet-400",dot:"bg-violet-400 status-dot"},
    processing: {label:"Generating…", color:"text-amber-400", dot:"bg-amber-400 status-dot"},
    speaking:   {label:"Speaking…",   color:"text-emerald-400",dot:"bg-emerald-400 status-dot"},
    error:      {label:"Error",       color:"text-red-400",   dot:"bg-red-400"},
    paused:     {label:"Paused",      color:"text-slate-400", dot:"bg-slate-500"},
  };
  const {label,color,dot} = m[status];
  return (
    <div className={`flex items-center gap-2 text-sm font-medium ${color}`}>
      <span className={`w-2 h-2 rounded-full ${dot}`}/>{label}
    </div>
  );
}

export default function Home() {
  const [status,       setStatus]       = useState<AppStatus>("idle");
  const [transcript,   setTranscript]   = useState("");
  const [interim,      setInterim]      = useState("");
  const [code,         setCode]         = useState("");
  const [previewHtml,  setPreviewHtml]  = useState(PLACEHOLDER);
  const [errorMsg,     setErrorMsg]     = useState("");
  const [muted,        setMuted]        = useState(false);
  const [connected,    setConnected]    = useState(true);
  const [copied,       setCopied]       = useState(false);
  const [tab,          setTab]          = useState<"preview"|"code">("preview");
  const [history,      setHistory]      = useState<{prompt:string;summary:string}[]>([]);

  const recRef     = useRef<SpeechRecognition|null>(null);
  const synthRef   = useRef<SpeechSynthesis|null>(null);
  const pausedRef  = useRef(false);
  const iframeRef  = useRef<HTMLIFrameElement>(null);

  const startListening = useCallback(() => {
    if (!recRef.current || pausedRef.current) return;
    try { recRef.current.start(); } catch { /* already running */ }
  }, []);

  const stopListening = useCallback(() => { recRef.current?.stop(); }, []);

  const speak = useCallback((text: string) => {
    if (muted || !synthRef.current) return;
    synthRef.current.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05; u.pitch = 1; u.volume = 1;
    const v = synthRef.current.getVoices();
    const pref = v.find(x => x.name.includes("Google") || x.lang === "en-US");
    if (pref) u.voice = pref;
    u.onstart = () => setStatus("speaking");
    u.onend   = () => { if (!pausedRef.current) { setStatus("listening"); startListening(); } };
    u.onerror = () => { if (!pausedRef.current) { setStatus("listening"); startListening(); } };
    synthRef.current.speak(u);
  }, [muted, startListening]);

  const generate = useCallback(async (prompt: string) => {
    if (!prompt.trim()) return;
    setStatus("processing"); setErrorMsg("");
    recRef.current?.stop();
    try {
      const res  = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data: GenerateResponse = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      setCode(data.html_code);
      setPreviewHtml(data.html_code);
      setHistory(p => [{prompt, summary: data.spoken_summary}, ...p].slice(0,10));
      setConnected(true);
      speak(data.spoken_summary);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setErrorMsg(msg); setStatus("error"); setConnected(false);
      speak(`Sorry, there was an error: ${msg}`);
    }
  }, [speak]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if ("speechSynthesis" in window) {
      synthRef.current = window.speechSynthesis;
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
    }
    const API = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!API) { setErrorMsg("Speech Recognition not supported. Use Chrome or Edge."); setStatus("error"); return; }
    const rec = new API();
    rec.continuous = true; rec.interimResults = true; rec.lang = "en-US"; rec.maxAlternatives = 1;
    rec.onstart  = () => { setStatus("listening"); setInterim(""); };
    rec.onresult = (e: SpeechRecognitionEvent) => {
      let fin = "", int = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) fin += r[0].transcript; else int += r[0].transcript;
      }
      setInterim(int);
      if (fin.trim()) { setTranscript(fin.trim()); setInterim(""); generate(fin.trim()); }
    };
    rec.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error === "no-speech" || e.error === "aborted") {
        if (!pausedRef.current) setTimeout(() => startListening(), 300); return;
      }
      setErrorMsg(`Mic error: ${e.error}`); setStatus("error");
    };
    rec.onend = () => { if (!pausedRef.current) setTimeout(() => { if (!pausedRef.current) startListening(); }, 300); };
    recRef.current = rec;
    return () => { rec.abort(); synthRef.current?.cancel(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleMic = useCallback(() => {
    if (pausedRef.current) { pausedRef.current = false; setStatus("listening"); startListening(); }
    else { pausedRef.current = true; synthRef.current?.cancel(); stopListening(); setStatus("paused"); setInterim(""); }
  }, [startListening, stopListening]);

  const toggleMute = useCallback(() => {
    setMuted(p => { if (!p) synthRef.current?.cancel(); return !p; });
  }, []);

  const copyCode = useCallback(() => {
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }, [code]);

  const refreshPreview = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    if (doc && previewHtml) { doc.open(); doc.write(previewHtml); doc.close(); }
  }, [previewHtml]);

  useEffect(() => { refreshPreview(); }, [previewHtml, refreshPreview]);

  const paused = status === "paused";

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0f] text-slate-100 overflow-hidden">

      {/* Top bar */}
      <header className="flex-none flex items-center justify-between px-6 py-3 border-b border-slate-800/60 bg-slate-900/80 backdrop-blur-sm z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white"/>
          </div>
          <div>
            <h1 className="text-sm font-bold text-white leading-none">Voice AI Assistant</h1>
            <p className="text-xs text-slate-500 leading-none mt-0.5">Llama 3 · Hugging Face</p>
          </div>
        </div>

        <div className="hidden md:flex flex-1 mx-8 max-w-xl">
          <div className="w-full px-4 py-2 rounded-full bg-slate-800/60 border border-slate-700/50 text-sm text-center truncate">
            {interim    ? <span className="text-violet-300 italic">{interim}</span>
            : transcript? <span className="text-slate-300">{transcript}</span>
            :             <span className="text-slate-600">{paused ? "Microphone paused" : "Waiting for your voice…"}</span>}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border
            ${connected ? "bg-emerald-950/50 border-emerald-800/50 text-emerald-400"
                        : "bg-red-950/50 border-red-800/50 text-red-400"}`}>
            {connected ? <Wifi className="w-3.5 h-3.5"/> : <WifiOff className="w-3.5 h-3.5"/>}
            <span className="hidden sm:inline">{connected ? "Connected" : "Disconnected"}</span>
          </div>
          <button onClick={toggleMute} className="p-2 rounded-full border border-slate-700 bg-slate-800 text-slate-300 hover:text-white transition-all">
            {muted ? <VolumeX className="w-4 h-4"/> : <Volume2 className="w-4 h-4"/>}
          </button>
          <button onClick={toggleMic}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium border transition-all
              ${paused ? "bg-violet-600 border-violet-500 text-white hover:bg-violet-500"
                       : "bg-slate-800 border-slate-700 text-slate-300 hover:text-white"}`}>
            {paused ? <><Mic className="w-4 h-4"/><span className="hidden sm:inline">Resume</span></>
                    : <><MicOff className="w-4 h-4"/><span className="hidden sm:inline">Pause</span></>}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* Left panel */}
        <div className="flex flex-col w-[420px] flex-none border-r border-slate-800/60 bg-slate-900/40">
          <div className="flex flex-col items-center justify-center py-10 px-6 border-b border-slate-800/60 bg-gradient-to-b from-slate-900/60 to-transparent">
            <MicVisualizer status={status}/>
            <div className="mt-12 text-center space-y-1">
              <StatusBadge status={status}/>
              {errorMsg && <p className="text-xs text-red-400 max-w-xs mt-2 leading-relaxed">{errorMsg}</p>}
            </div>
            {status === "idle" && (
              <button onClick={toggleMic}
                className="mt-6 px-6 py-2.5 rounded-full bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-all shadow-lg shadow-violet-500/30">
                Start Listening
              </button>
            )}
          </div>

          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800/60">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
                <Code2 className="w-3.5 h-3.5"/> Generated Code
              </div>
              {code && (
                <button onClick={copyCode}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-slate-400 hover:text-white hover:bg-slate-700/60 transition-all">
                  {copied ? <><Check className="w-3 h-3 text-emerald-400"/><span className="text-emerald-400">Copied!</span></>
                           : <><Copy className="w-3 h-3"/>Copy</>}
                </button>
              )}
            </div>
            <div className="flex-1 overflow-auto p-4">
              {code
                ? <pre className="code-area text-xs text-slate-300 whitespace-pre-wrap break-words"><code>{code}</code></pre>
                : <div className="flex flex-col items-center justify-center h-full text-center space-y-3 py-8">
                    <Code2 className="w-10 h-10 text-slate-700"/>
                    <p className="text-sm text-slate-600">Generated HTML will appear here</p>
                  </div>}
            </div>
          </div>

          {history.length > 0 && (
            <div className="border-t border-slate-800/60 px-4 py-3 space-y-2 max-h-40 overflow-y-auto">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Recent</p>
              {history.map((h,i) => (
                <div key={i} className="text-xs text-slate-500 truncate">
                  <span className="text-violet-400 mr-1">›</span>{h.prompt}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right panel */}
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800/60 bg-slate-900/40">
            <div className="flex items-center gap-1 bg-slate-800/60 rounded-lg p-1">
              {(["preview","code"] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all
                    ${tab===t ? "bg-slate-700 text-white" : "text-slate-500 hover:text-slate-300"}`}>
                  {t==="preview" ? <><Eye className="w-3.5 h-3.5"/>Preview</> : <><Code2 className="w-3.5 h-3.5"/>Source</>}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              {status==="processing" && (
                <div className="flex items-center gap-2 text-xs text-amber-400">
                  <Loader2 className="w-3.5 h-3.5 animate-spin"/>Generating…
                </div>
              )}
              <button onClick={refreshPreview} className="p-1.5 rounded-md text-slate-500 hover:text-slate-300 hover:bg-slate-700/60 transition-all">
                <RefreshCw className="w-3.5 h-3.5"/>
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-hidden relative">
            {status==="processing" && (
              <div className="absolute inset-0 z-10 bg-slate-900/70 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
                <div className="relative">
                  <div className="w-16 h-16 rounded-full border-2 border-violet-500/30 border-t-violet-500 animate-spin"/>
                  <Sparkles className="absolute inset-0 m-auto w-6 h-6 text-violet-400"/>
                </div>
                <p className="text-sm font-medium text-white">Generating your code…</p>
              </div>
            )}
            {tab==="preview"
              ? <iframe ref={iframeRef} title="Live Preview" sandbox="allow-scripts allow-same-origin" className="w-full h-full border-0 bg-white"/>
              : <div className="w-full h-full overflow-auto bg-[#0d1117] p-6">
                  {code
                    ? <pre className="code-area text-xs text-slate-300 whitespace-pre-wrap break-words"><code>{code}</code></pre>
                    : <div className="flex items-center justify-center h-full text-slate-600 text-sm">No code generated yet</div>}
                </div>}
          </div>
        </div>
      </div>
    </div>
  );
}
