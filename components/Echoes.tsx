import React, { useState, useRef, useEffect } from 'react';
import { 
  BookOpen, 
  Music, 
  Film, 
  Loader2, 
  Sparkles, 
  Ghost, 
  Moon, 
  ArrowLeft, 
  Compass, 
  MessageCircle, 
  ExternalLink, 
  RefreshCw,
  Archive,
  Volume2,
  VolumeX,
  X,
  Clock,
  Key
} from 'lucide-react';
import { findEchoesForFeeling, generateEchoArtifact } from '../services/geminiService';
import type { EchoData, HistoryItem } from '../types';

const PLACEHOLDERS = [
  "the specific loneliness of 3 AM...",
  "nostalgia for a time I never lived in...",
  "the silence after a loud party...",
  "feeling like a ghost in my own life...",
  "the smell of old books and rain...",
  "the heavy quiet of a sunday evening...",
  "missing a version of myself that no longer exists...",
  "the weight of unsaid words...",
  "craving a silence I can't explain..."
];

const DRIFT_CONCEPTS = [
  "The strange comfort of being alone in a crowded room.",
  "A longing for a home you can't return to, or that never was.",
  "The realization that you are currently living in a memory.",
  "The desire to care less about things that mean so much.",
  "Nostalgia for a conversation you haven't had yet.",
  "Finding beauty in things that are falling apart."
];

type ViewState = 'input' | 'echo' | 'synthesizing' | 'artifact' | 'key_check';

const Echoes: React.FC = () => {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<EchoData | null>(null);
  const [error, setError] = useState('');
  const [view, setView] = useState<ViewState>('key_check');
  const [synthesisImage, setSynthesisImage] = useState<string | null>(null);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  
  const [isMuted, setIsMuted] = useState(false);
  const [showShoebox, setShowShoebox] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  
  const audioContextRef = useRef<AudioContext | null>(null);

  // --- API KEY SELECTION LOGIC ---
  useEffect(() => {
    const checkApiKey = async () => {
      // @ts-ignore
      if (typeof window.aistudio !== 'undefined') {
        // @ts-ignore
        const hasKey = await window.aistudio.hasSelectedApiKey();
        if (hasKey) {
          setView('input');
        }
      } else {
        // Fallback for environments without aistudio global
        setView('input');
      }
    };
    checkApiKey();
  }, []);

  const handleOpenKey = async () => {
    // @ts-ignore
    if (typeof window.aistudio !== 'undefined') {
      // @ts-ignore
      await window.aistudio.openSelectKey();
      // Proceed immediately as per race condition instructions
      setView('input');
    }
  };

  // --- AMBIENT AUDIO ENGINE ---
  useEffect(() => {
    let lastOut = 0;
    const initAudio = () => {
      if (audioContextRef.current) return;
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContext();
      audioContextRef.current = ctx;
      const bufferSize = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const dataArr = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        dataArr[i] = (lastOut + (0.02 * white)) / 1.02;
        lastOut = dataArr[i];
        dataArr[i] *= 3.5;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 400; 
      const gain = ctx.createGain();
      gain.gain.value = 0.05;
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noise.start();
      if (isMuted) ctx.suspend();
    };

    const handleInteraction = () => {
        if (!audioContextRef.current) initAudio();
        else if (audioContextRef.current.state === 'suspended' && !isMuted) audioContextRef.current.resume();
    };

    window.addEventListener('click', handleInteraction);
    return () => {
        window.removeEventListener('click', handleInteraction);
        if (audioContextRef.current) audioContextRef.current.close();
    };
  }, [isMuted]);

  useEffect(() => {
    if (audioContextRef.current) {
        if (isMuted) audioContextRef.current.suspend();
        else audioContextRef.current.resume();
    }
  }, [isMuted]);

  // --- PERSISTENCE ---
  useEffect(() => {
      const savedHistory = localStorage.getItem('echoes_history');
      if (savedHistory) {
          try { setHistory(JSON.parse(savedHistory)); } catch(e) { console.error("History parse error", e); }
      }
      const savedSession = localStorage.getItem('echoes_active_session');
      if (savedSession) {
          try {
              const parsed = JSON.parse(savedSession);
              if (parsed.data) {
                  setData(parsed.data);
                  setInput(parsed.input || '');
                  if (parsed.view === 'artifact' && parsed.synthesisImage) setSynthesisImage(parsed.synthesisImage);
                  // Only restore view if we aren't stuck on key_check
                  if (view !== 'key_check') setView(parsed.view || 'echo');
              }
          } catch (e) { console.error("Failed to restore session", e); }
      }
  }, []);

  const saveToShoebox = (newData: EchoData, prompt: string) => {
      const newItem: HistoryItem = { id: Date.now().toString(), timestamp: Date.now(), input: prompt, data: newData };
      const newHistory = [newItem, ...history].slice(0, 50);
      setHistory(newHistory);
      localStorage.setItem('echoes_history', JSON.stringify(newHistory));
  };

  const loadFromShoebox = (item: HistoryItem) => {
      setData(item.data);
      setInput(item.input);
      setView('echo');
      setSynthesisImage(null);
      setShowShoebox(false);
  };

  useEffect(() => {
    if (data && view !== 'key_check') {
        localStorage.setItem('echoes_active_session', JSON.stringify({ data, input, view, synthesisImage }));
    }
  }, [data, input, view, synthesisImage]);

  useEffect(() => {
    if (view !== 'input') return;
    const interval = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % PLACEHOLDERS.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [view]);

  // --- MAIN ACTIONS ---
  const findEcho = async (overrideInput?: string) => {
    const searchTerm = overrideInput || input;
    if (!searchTerm || !searchTerm.trim()) return;
    setLoading(true);
    setError('');
    setSynthesisImage(null); 
    const delayPromise = new Promise(resolve => setTimeout(resolve, 2000));
    try {
      const [resultData] = await Promise.all([ findEchoesForFeeling(searchTerm), delayPromise ]);
      setData(resultData);
      saveToShoebox(resultData, searchTerm);
      setView('echo');
    } catch (err: any) {
      console.error(err);
      if (err.message.includes("429") || err.message.toLowerCase().includes("quota")) {
        setError("Archive quota exceeded. Please select a personal API key from a paid project to continue.");
        // If aistudio is present, we could trigger openSelectKey directly or show a button
      } else if (err.message.includes("Requested entity was not found")) {
        setError("Invalid API key configuration. Please re-select your key.");
        handleOpenKey();
      } else {
        setError(err.message || "The archive is silent. Please check your connection.");
      }
    } finally { setLoading(false); }
  };

  const generateArtifact = async () => {
    if (!data) return;
    setView('synthesizing');
    const echoInfluences = data.echoes.map(e => `${e.title} (${e.type})`).join(', ');
    const synthesisPrompt = `Abstract, surreal, and conceptual art for feeling: "${data.thematic_key}". Context: ${input}. Influences: ${echoInfluences}. Color palette: ${data.color_hex}. No text.`;
    try {
      const imageUrl = await generateEchoArtifact(synthesisPrompt);
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.src = imageUrl;
      img.onload = () => { setSynthesisImage(imageUrl); setView('artifact'); };
      img.onerror = () => { setError("Unable to render artifact."); setView('echo'); };
    } catch (err) {
      setError("Unable to synthesize artifact visual.");
      setView('echo');
    }
  };

  const handleDownloadCard = async () => {
    if (!synthesisImage || !data) return;
    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if(!ctx) return;
        const width = 1200;
        const tracklistHeight = 150 + (data.echoes.length * 80); 
        const height = width + tracklistHeight;
        canvas.width = width; canvas.height = height;
        ctx.fillStyle = '#0c0a09'; ctx.fillRect(0, 0, width, height);
        const img = new Image();
        img.crossOrigin = "Anonymous"; 
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = () => reject(new Error("Failed to load image"));
            img.src = synthesisImage.startsWith('http') ? `${synthesisImage}${synthesisImage.includes('?') ? '&' : '?'}cb=${Date.now()}` : synthesisImage;
        });
        ctx.drawImage(img, 0, 0, width, width);
        const contentStartY = width + 80;
        ctx.fillStyle = '#e7e5e4'; ctx.font = 'bold 60px Serif';
        ctx.fillText(data.thematic_key, 60, contentStartY);
        let currentY = contentStartY + 80;
        data.echoes.forEach((echo) => {
            ctx.fillStyle = '#a8a29e'; ctx.font = 'bold 32px Sans-Serif';
            ctx.fillText(echo.title.toUpperCase(), 60, currentY);
            ctx.fillStyle = '#57534e'; ctx.font = '24px Monospace';
            ctx.fillText(`${echo.creator} / ${echo.year}`, 60, currentY + 35);
            currentY += 80; 
        });
        ctx.fillStyle = '#44403c'; ctx.font = '20px Monospace'; ctx.textAlign = 'center';
        ctx.fillText(`ECHOES ARCHIVE • ${new Date().toLocaleDateString()}`, width / 2, height - 40);
        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/png');
        link.download = `echoes-artifact-${data.thematic_key.toLowerCase()}.png`;
        link.click();
    } catch (e) {
        const link = document.createElement('a');
        link.href = synthesisImage;
        link.download = `echoes-artifact-image.jpg`;
        link.click();
    }
  };

  const handleReset = () => { setData(null); setInput(''); setView('input'); setSynthesisImage(null); setError(''); localStorage.removeItem('echoes_active_session'); };
  const handleBack = () => view === 'artifact' ? setView('echo') : setView('input');

  const getIcon = (type: string) => {
    const t = type.toLowerCase();
    if (t.includes('book') || t.includes('poetry')) return <BookOpen className="w-4 h-4" />;
    if (t.includes('song') || t.includes('music')) return <Music className="w-4 h-4" />;
    if (t.includes('film') || t.includes('movie')) return <Film className="w-4 h-4" />;
    return <Ghost className="w-4 h-4" />;
  };

  if (view === 'key_check') {
    return (
      <div className="min-h-screen bg-stone-950 flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-1000">
        <Sparkles className="w-12 h-12 text-stone-600 mb-8" />
        <h1 className="text-3xl md:text-4xl font-light text-stone-100 mb-6">Unlock the Archive</h1>
        <p className="text-stone-500 max-w-sm mb-12 font-sans tracking-wide leading-relaxed">
          The Silent Archivist is restricted. Please connect a personal API key from a paid GCP project to access the collection.
        </p>
        <button 
          onClick={handleOpenKey}
          className="px-8 py-4 bg-stone-100 text-stone-900 rounded-full font-bold text-xs uppercase tracking-[0.2em] hover:scale-105 transition-transform flex items-center gap-2"
        >
          <Key className="w-4 h-4" /> Select API Key
        </button>
        <a 
          href="https://ai.google.dev/gemini-api/docs/billing" 
          target="_blank" 
          rel="noopener noreferrer"
          className="mt-8 text-stone-600 hover:text-stone-400 text-[10px] uppercase tracking-widest transition-colors underline underline-offset-4"
        >
          Billing Documentation
        </a>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-950 text-stone-200 font-serif selection:bg-stone-800 transition-colors duration-1000 overflow-hidden relative">
      <div className="fixed inset-0 pointer-events-none z-0">
        {view === 'artifact' && synthesisImage && (
            <div className="absolute inset-0 z-0 opacity-20 scale-110 blur-3xl transition-opacity duration-[2000ms]">
                <img src={synthesisImage} className="w-full h-full object-cover" alt="Background" />
            </div>
        )}
      </div>

      <div className="z-10 w-full min-h-[100dvh] relative flex flex-col">
        <header className="absolute top-0 left-0 w-full z-50 px-6 py-6 md:px-8 flex items-center justify-between pointer-events-none">
            <div className="flex items-center gap-4 pointer-events-auto">
                {view !== 'input' && (
                    <button onClick={handleBack} className="opacity-70 hover:opacity-100 transition-opacity p-2 -ml-2"><ArrowLeft className="w-6 h-6 text-stone-300" /></button>
                )}
                <button onClick={handleReset} className="flex items-center gap-2 group transition-all duration-500">
                    <Sparkles className="w-4 h-4 text-stone-200 group-hover:text-white" />
                    <span className="text-xs tracking-[0.4em] uppercase font-medium text-stone-200 group-hover:text-white">Echoes</span>
                </button>
            </div>
            <div className="flex items-center gap-4 pointer-events-auto">
                <button onClick={() => setIsMuted(!isMuted)} className="p-2 text-stone-500 hover:text-stone-300 transition-colors">
                    {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <button onClick={handleOpenKey} className="p-2 text-stone-500 hover:text-stone-300 transition-colors" title="Change API Key">
                    <Key className="w-4 h-4" />
                </button>
                <button onClick={() => setShowShoebox(true)} className="p-2 text-stone-500 hover:text-stone-300 transition-colors relative"><Archive className="w-4 h-4" /></button>
            </div>
        </header>

        <div className={`fixed inset-y-0 right-0 w-80 bg-stone-900 border-l border-stone-800 shadow-2xl z-[60] transform transition-transform duration-500 ease-in-out ${showShoebox ? 'translate-x-0' : 'translate-x-full'}`}>
            <div className="p-6 h-full flex flex-col">
                <div className="flex items-center justify-between mb-8">
                    <h2 className="text-sm uppercase tracking-widest text-stone-400 font-medium flex items-center gap-2"><Archive className="w-4 h-4" /> The Shoebox</h2>
                    <button onClick={() => setShowShoebox(false)} className="text-stone-500 hover:text-stone-300"><X className="w-5 h-5" /></button>
                </div>
                <div className="flex-grow overflow-y-auto space-y-4 pr-2">
                    {history.length === 0 ? (
                        <div className="text-stone-600 text-sm font-mono text-center pt-12">The archive is empty.<br/>Trace a feeling to begin.</div>
                    ) : history.map((item) => (
                        <button key={item.id} onClick={() => loadFromShoebox(item)} className="w-full text-left p-4 bg-stone-950/50 hover:bg-stone-800 border border-stone-800 hover:border-stone-600 rounded-sm transition-all group">
                            <div className="text-[10px] text-stone-500 font-mono mb-2 flex items-center gap-2"><Clock className="w-3 h-3" />{new Date(item.timestamp).toLocaleDateString()}</div>
                            <div className="text-stone-300 font-serif text-lg leading-tight mb-1 group-hover:text-white">{item.data.thematic_key}</div>
                            <div className="text-xs text-stone-600 truncate font-sans">"{item.input}"</div>
                        </button>
                    ))}
                </div>
            </div>
        </div>
        
        {showShoebox && <div onClick={() => setShowShoebox(false)} className="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm transition-opacity" />}

        <main className="flex-grow flex flex-col pt-24">
          {view === 'input' && (
            <div className="flex-grow flex flex-col justify-center items-center max-w-2xl mx-auto w-full px-6 animate-in fade-in zoom-in-95 duration-1000">
              <div className="text-center mb-12">
                  <h1 className="text-3xl md:text-5xl font-light text-stone-200 leading-tight mb-4">Trace your feeling.</h1>
                  <p className="text-stone-500 text-[15px] md:text-base font-sans font-light tracking-wide">The archive is open. What are you carrying today?</p>
              </div>
              <div className="relative group w-full mb-10 text-center">
                <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={PLACEHOLDERS[placeholderIndex]} className="w-full bg-transparent border-b border-stone-800 text-xl md:text-2xl py-4 focus:outline-none focus:border-stone-500 transition-colors placeholder-stone-800 font-serif text-center" onKeyDown={(e) => e.key === 'Enter' && findEcho()} />
              </div>
              <div className="w-full flex flex-col items-center gap-6">
                 <button onClick={() => findEcho()} disabled={loading || !input.trim()} className={`w-full max-w-xs py-4 rounded-full font-bold text-xs uppercase tracking-[0.2em] transition-all duration-500 transform ${input.trim() ? 'bg-stone-200 text-stone-900 hover:bg-white hover:scale-105 opacity-100 translate-y-0' : 'bg-stone-900 text-stone-600 border border-stone-800 opacity-0 translate-y-4 pointer-events-none'}`}>
                    {loading ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> tracing...</span> : 'Trace This Feeling'}
                </button>
                <button onClick={() => setInput(DRIFT_CONCEPTS[Math.floor(Math.random() * DRIFT_CONCEPTS.length)])} className="px-6 py-2 rounded-full text-[10px] text-stone-600 hover:text-stone-400 transition-all uppercase tracking-widest flex items-center gap-2 group"><Compass className="w-3 h-3 group-hover:rotate-45 transition-transform" />Drift</button>
                {error && <div className="text-red-400 text-xs tracking-wider text-center px-4 mt-6 font-sans leading-relaxed max-w-sm">{error}</div>}
              </div>
            </div>
          )}

          {view === 'echo' && data && (
            <div className="flex-grow overflow-y-auto w-full px-4 md:px-8 py-8 animate-in fade-in duration-1000">
              <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4 auto-rows-min">
                  <div className="md:col-span-2 bg-stone-900/40 border border-stone-800/50 p-6 md:p-8 rounded-sm flex flex-col justify-between min-h-[180px]">
                      <div className="flex justify-between items-start mb-4">
                          <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">You Traced</div>
                          <button onClick={() => findEcho()} disabled={loading} className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-stone-800 bg-stone-900/50 text-[9px] uppercase tracking-widest text-stone-400 hover:text-white transition-all"><RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />Reshuffle</button>
                      </div>
                      <div className="flex-grow flex items-center justify-center text-center"><div className="text-2xl md:text-3xl font-serif text-stone-200 leading-tight">"{input}"</div></div>
                  </div>
                  <div className="md:col-span-1 bg-stone-900/40 border border-stone-800/50 p-6 md:p-8 rounded-sm flex flex-col justify-center items-center text-center">
                      <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500 mb-2">Resonance Key</div>
                      <div className="text-xl font-medium tracking-widest uppercase" style={{ color: data.color_hex }}>{data.thematic_key}</div>
                  </div>
                  {data.echoes.map((item, idx) => (
                      <div key={idx} className={`bg-stone-900/40 border border-stone-800/50 p-6 md:p-8 rounded-sm flex flex-col justify-between group hover:bg-stone-900/60 transition-all duration-1000 ease-out ${idx === 0 ? 'md:col-span-2' : 'md:col-span-1'}`}>
                           <div className="mb-6">
                               <div className="flex items-center justify-between mb-4">
                                  <div className="flex items-center gap-2" style={{ color: data.color_hex }}>{getIcon(item.type)}<span className="text-[10px] uppercase tracking-widest font-semibold opacity-90">{item.type}</span></div>
                                  <a href={`https://www.google.com/search?q=${encodeURIComponent(item.title + ' ' + item.creator)}`} target="_blank" rel="noopener noreferrer" className="opacity-0 group-hover:opacity-100 transition-opacity text-stone-500 hover:text-white"><ExternalLink className="w-4 h-4" /></a>
                               </div>
                               <blockquote className="text-lg md:text-xl font-serif text-stone-200 leading-relaxed">"{item.content}"</blockquote>
                           </div>
                           <div className="border-t border-stone-800/50 pt-4 mt-auto">
                               <div className="text-xs font-bold text-white tracking-wide">{item.title}</div>
                               <div className="text-[10px] text-stone-500 uppercase tracking-widest mt-1">{item.creator} <span className="text-stone-700 mx-1">/</span> {item.year}</div>
                           </div>
                      </div>
                  ))}
                  <div className="md:col-span-1 bg-stone-900/20 border border-dashed border-stone-700 p-6 rounded-sm flex flex-col justify-between transition-all group relative overflow-hidden">
                      <div className="relative z-10">
                          <div className="flex items-center gap-2 text-stone-400 mb-4"><MessageCircle className="w-4 h-4" /><span className="text-[10px] uppercase tracking-widest font-medium font-mono">The Human Archive</span></div>
                          <p className="text-sm text-stone-300 leading-relaxed font-mono opacity-80 tracking-tight">"{data.community_insight}"</p>
                      </div>
                  </div>
              </div>
              <div className="fixed bottom-0 left-0 w-full bg-gradient-to-t from-stone-950 via-stone-950/95 to-transparent pt-12 pb-8 px-8 flex justify-between items-end z-20 pointer-events-none">
                  <button onClick={handleReset} className="px-5 py-2 rounded-full border border-stone-700 bg-stone-950 text-[10px] uppercase tracking-widest text-stone-400 hover:text-stone-200 transition-all pointer-events-auto">Trace Another</button>
                  <button onClick={generateArtifact} className="flex items-center gap-3 px-6 py-3 rounded-full bg-stone-100 text-stone-950 hover:scale-105 transition-all group pointer-events-auto"><Moon className="w-3 h-3 fill-current" /><span className="text-xs font-bold uppercase tracking-widest">Sit with this</span></button>
              </div>
            </div>
          )}

          {view === 'synthesizing' && (
              <div className="flex-grow flex flex-col justify-center items-center animate-in fade-in duration-1000">
                  <Loader2 className="w-8 h-8 animate-spin text-stone-500" />
                  <div className="mt-8 text-xs tracking-[0.3em] uppercase text-stone-500 animate-pulse">Synthesizing Artifact</div>
              </div>
          )}

          {view === 'artifact' && synthesisImage && data && (
              <div className="flex-grow w-full h-full flex flex-col justify-center items-center px-6 py-8 animate-in fade-in duration-1000">
                  <div className="flex flex-col items-center justify-center w-full max-w-sm flex-grow">
                      <div className="relative w-full bg-stone-900 shadow-2xl overflow-hidden group border border-stone-800">
                          <div className="aspect-square w-full relative overflow-hidden"><img src={synthesisImage} alt="Artifact" className="w-full h-full object-cover" /></div>
                          <div className="bg-stone-950 p-6 space-y-3 border-t border-stone-800">
                              <div className="pb-4 mb-4 border-b border-stone-900"><h2 className="text-2xl font-serif text-white leading-none">{data.thematic_key}</h2></div>
                              {data.echoes.map((echo, idx) => (
                                  <div key={idx} className="flex justify-between items-center text-[10px] text-stone-500"><span className="uppercase tracking-wider truncate max-w-[180px] text-stone-400">{echo.title}</span><span className="font-mono opacity-50">{echo.year}</span></div>
                              ))}
                          </div>
                      </div>
                      <div className="mt-8 flex flex-col gap-4 w-full">
                          <button onClick={handleDownloadCard} className="w-full py-4 bg-stone-100 text-stone-950 font-bold text-xs uppercase tracking-widest rounded-full hover:scale-105 transition-transform">Download Artifact</button>
                          <button onClick={handleReset} className="w-full py-4 border border-stone-800 text-stone-400 font-medium text-xs uppercase tracking-widest rounded-full hover:text-white transition-colors">Trace Another</button>
                      </div>
                  </div>
              </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default Echoes;