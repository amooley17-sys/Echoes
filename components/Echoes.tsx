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
  ArrowRight
} from 'lucide-react';
import { findEchoesForFeeling, generateEchoArtifact } from '../services/geminiService';
import type { EchoData, HistoryItem } from '../types';

const PLACEHOLDERS = [
  "the specific loneliness of 3 AM...",
  "nostalgia for a time I never lived in...",
  "the silence after a loud party...",
  "feeling like a ghost in my own life...",
  "the smell of old books and rain...",
  "missing a version of myself that no longer exists...",
  "the weight of unsaid words...",
  "craving a silence I can't explain..."
];

const DRIFT_CONCEPTS = [
  "The strange comfort of being alone in a crowded room.",
  "A longing for a home you can't return to, or that never was.",
  "The realization that you are currently living in a memory.",
  "Finding beauty in things that are falling apart.",
  "Nostalgia for a conversation you haven't had yet."
];

const CINEMATIC_STYLES = [
  "Wong Kar-wai neon melancholy, high contrast, blurred movement, cinematic green and red hues",
  "Tarkovsky-esque pastoral stillness, muted earthy tones, fog-drenched landscapes, 35mm grain",
  "A24 modern minimalist aesthetic, sharp focus, uncanny lighting, evocative suburban or urban isolation",
  "Classic Noir, deep shadows, dramatic rim lighting, wet pavement, smoke, high monochrome contrast",
  "French New Wave, natural light, nostalgic 1960s film stock, candid emotional moment",
  "Edward Hopper-inspired cinematic shot, lonely diners, long shadows, evocative architecture",
  "Cyberpunk liminality, rainy windows, neon reflections, industrial loneliness",
  "Wes Anderson-esque symmetrical loneliness, pastel palettes, meticulously composed isolation"
];

type ViewState = 'input' | 'echo' | 'synthesizing' | 'artifact';

const Echoes: React.FC = () => {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<EchoData | null>(null);
  const [error, setError] = useState('');
  const [view, setView] = useState<ViewState>('input');
  const [synthesisImage, setSynthesisImage] = useState<string | null>(null);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  
  const [isMuted, setIsMuted] = useState(false);
  const [showShoebox, setShowShoebox] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  
  const audioContextRef = useRef<AudioContext | null>(null);

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
      const savedHistory = localStorage.getItem('echoes_history');
      if (savedHistory) {
          try { setHistory(JSON.parse(savedHistory)); } catch(e) { console.error("History error", e); }
      }
      const savedSession = localStorage.getItem('echoes_active_session');
      if (savedSession) {
          try {
              const parsed = JSON.parse(savedSession);
              if (parsed.data) {
                  setData(parsed.data);
                  setInput(parsed.input || '');
                  setView(parsed.view || 'echo');
                  if (parsed.view === 'artifact' && parsed.synthesisImage) setSynthesisImage(parsed.synthesisImage);
              }
          } catch (e) { console.error("Restore error", e); }
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
    if (data) {
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

  const findEcho = async (overrideInput?: string) => {
    const searchTerm = overrideInput || input;
    if (!searchTerm || !searchTerm.trim()) return;
    setLoading(true);
    setError('');
    setSynthesisImage(null); 
    try {
      const resultData = await findEchoesForFeeling(searchTerm);
      setData(resultData);
      saveToShoebox(resultData, searchTerm);
      setView('echo');
    } catch (err: any) {
      setError("The archive is silent. " + (err.message || "Please check your connection."));
    } finally { setLoading(false); }
  };

  const generateArtifact = async () => {
    if (!data) return;
    setView('synthesizing');
    setError('');
    
    const randomStyle = CINEMATIC_STYLES[Math.floor(Math.random() * CINEMATIC_STYLES.length)];
    
    const synthesisPrompt = `
      Create a cinematic vignette—a high-quality movie still—that evokes the visceral feeling of: "${input}".
      Visual Story: Instead of a literal diagram, show a metaphorical scene. 
      For example, if the feeling is lonely, show a blurred figure in a rainy phone booth, or a single lit window in a dark brutalist block, or a half-eaten meal in a diner at 4am.
      Cinematic Style: ${randomStyle}.
      Mood: Use a palette anchored by ${data.color_hex} lighting accents. 
      Details: 35mm film grain, anamorphic lens flares, rich atmospheric depth, evocative lighting, deep emotional resonance.
      STRICTLY FORBIDDEN: Do not render any written text, typography, logos, or words in the image.
      STRICTLY FORBIDDEN: Do not use literal statues or abstract shapes. It must look like a shot from a live-action film.
      The result must look like a high-budget film still, deeply emotional and narratively suggestive.
    `;

    try {
      const imageUrl = await generateEchoArtifact(synthesisPrompt);
      setSynthesisImage(imageUrl);
      setView('artifact');
    } catch (err: any) {
      console.error("Artifact error", err);
      setError(`Synthesis interrupted: ${err.message || "Unexpected error"}`);
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
        canvas.width = width;
        canvas.height = height;
        ctx.fillStyle = '#0c0a09'; 
        ctx.fillRect(0, 0, width, height);
        const img = new Image();
        img.crossOrigin = "anonymous"; 
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = synthesisImage;
        });
        ctx.drawImage(img, 0, 0, width, width);
        const contentStartY = width + 80;
        ctx.fillStyle = '#e7e5e4'; 
        ctx.font = 'bold 60px Serif';
        ctx.fillText(data.thematic_key, 60, contentStartY);
        let currentY = contentStartY + 80;
        data.echoes.forEach((echo) => {
            ctx.fillStyle = '#a8a29e'; 
            ctx.font = 'bold 32px Sans-Serif';
            ctx.fillText(echo.title.toUpperCase(), 60, currentY);
            ctx.fillStyle = '#57534e'; 
            ctx.font = '24px Monospace';
            ctx.fillText(`${echo.creator} / ${echo.year}`, 60, currentY + 35);
            currentY += 80; 
        });
        const dataUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `echoes-${data.thematic_key.toLowerCase()}.png`;
        link.click();
    } catch (e) {
        const link = document.createElement('a');
        link.href = synthesisImage;
        link.download = 'echo-artifact.png';
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

  return (
    <div className="min-h-screen bg-stone-950 text-stone-200 font-serif selection:bg-stone-800 transition-colors duration-1000 overflow-hidden relative">
      <div className="fixed inset-0 pointer-events-none z-0">
        {view === 'artifact' && synthesisImage && (
            <div className="absolute inset-0 z-0 opacity-20 scale-110 blur-3xl transition-opacity duration-[2000ms]">
                <img src={synthesisImage} className="w-full h-full object-cover" alt="" />
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
                    <span className="text-xs tracking-[0.4em] uppercase font-medium text-stone-200">Echoes</span>
                </button>
            </div>
            <div className="flex items-center gap-4 pointer-events-auto">
                <button onClick={() => setIsMuted(!isMuted)} className="p-2 text-stone-500 hover:text-stone-300 transition-colors">
                    {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <button onClick={() => setShowShoebox(true)} className="p-2 text-stone-500 hover:text-stone-300 relative"><Archive className="w-4 h-4" /></button>
            </div>
        </header>

        <div className={`fixed inset-y-0 right-0 w-80 bg-stone-900 border-l border-stone-800 shadow-2xl z-[60] transform transition-transform duration-500 ${showShoebox ? 'translate-x-0' : 'translate-x-full'}`}>
            <div className="p-6 h-full flex flex-col">
                <div className="flex items-center justify-between mb-8">
                    <h2 className="text-sm uppercase tracking-widest text-stone-400 flex items-center gap-2"><Archive className="w-4 h-4" /> The Shoebox</h2>
                    <button onClick={() => setShowShoebox(false)} className="text-stone-500 hover:text-stone-300"><X className="w-5 h-5" /></button>
                </div>
                <div className="flex-grow overflow-y-auto space-y-4">
                    {history.length === 0 ? (
                        <div className="text-stone-600 text-sm font-mono text-center pt-12">The archive is empty.</div>
                    ) : history.map((item) => (
                        <button key={item.id} onClick={() => loadFromShoebox(item)} className="w-full text-left p-4 bg-stone-950/50 hover:bg-stone-800 border border-stone-800 rounded-sm transition-all group">
                            <div className="text-[10px] text-stone-500 font-mono mb-2 flex items-center gap-2"><Clock className="w-3 h-3" />{new Date(item.timestamp).toLocaleDateString()}</div>
                            <div className="text-stone-300 font-serif text-lg leading-tight mb-1 group-hover:text-white">{item.data.thematic_key}</div>
                            <div className="text-xs text-stone-600 truncate font-sans">"{item.input}"</div>
                        </button>
                    ))}
                </div>
            </div>
        </div>
        
        {showShoebox && <div onClick={() => setShowShoebox(false)} className="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm" />}

        <main className="flex-grow flex flex-col pt-24">
          {view === 'input' && (
            <div className="flex-grow flex flex-col justify-center items-center max-w-2xl mx-auto w-full px-6 animate-in fade-in zoom-in-95 duration-1000">
              <div className="text-center mb-12">
                  <h1 className="text-3xl md:text-5xl font-light text-stone-200 leading-tight mb-4">Trace your feeling.</h1>
                  <p className="text-stone-500 text-[15px] font-sans font-light tracking-wide">What are you carrying today?</p>
              </div>
              <div className="relative group w-full mb-10 text-center">
                <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={PLACEHOLDERS[placeholderIndex]} className="w-full bg-transparent border-b border-stone-800 text-xl md:text-2xl py-4 focus:outline-none focus:border-stone-500 transition-colors placeholder-stone-800 font-serif text-center" onKeyDown={(e) => e.key === 'Enter' && findEcho()} />
              </div>
              <div className="w-full flex flex-col items-center gap-6">
                 <button onClick={() => findEcho()} disabled={loading || !input.trim()} className={`w-full max-w-xs py-4 rounded-full font-bold text-xs uppercase tracking-[0.2em] transition-all duration-500 transform ${input.trim() ? 'bg-stone-200 text-stone-900 hover:bg-white hover:scale-105 opacity-100 shadow-[0_0_30px_rgba(255,255,255,0.05)]' : 'bg-stone-900 text-stone-600 opacity-0 pointer-events-none'}`}>
                    {loading ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> tracing...</span> : 'Trace This Feeling'}
                </button>
                <button onClick={() => setInput(DRIFT_CONCEPTS[Math.floor(Math.random() * DRIFT_CONCEPTS.length)])} className="px-6 py-2 rounded-full text-[10px] text-stone-600 hover:text-stone-400 transition-all uppercase tracking-widest flex items-center gap-2 group"><Compass className="w-3 h-3" />Drift</button>
                {error && <div className="text-red-400 text-xs text-center px-4 mt-6">{error}</div>}
              </div>
            </div>
          )}

          {view === 'echo' && data && (
            <div className="flex-grow overflow-y-auto w-full px-4 md:px-8 pt-8 pb-40 animate-in fade-in duration-1000">
              <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4 auto-rows-min mb-16">
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
                      <div key={idx} className={`bg-stone-900/40 border border-stone-800/50 p-6 md:p-8 rounded-sm flex flex-col justify-between group hover:bg-stone-900/60 transition-all duration-1000 ${idx === 0 ? 'md:col-span-2' : 'md:col-span-1'}`}>
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

                  {/* RESTORED COMMUNITY SECTION */}
                  <a 
                    href={`https://www.reddit.com/search/?q=${encodeURIComponent(data.search_query || input)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="md:col-span-1 bg-stone-900/20 border border-dashed border-stone-700 p-6 rounded-sm flex flex-col justify-between hover:border-stone-500 transition-all group cursor-pointer relative overflow-hidden"
                  >
                      <div className="relative z-10">
                          <div className="flex items-center gap-2 text-stone-400 mb-4">
                            <MessageCircle className="w-4 h-4" />
                            <span className="text-[10px] uppercase tracking-widest font-medium font-mono">The Human Archive</span>
                          </div>
                          <p className="text-sm text-stone-300 leading-relaxed font-mono opacity-80 tracking-tight">
                            "{data.community_insight}"
                          </p>
                      </div>
                      <div className="mt-6 flex items-center gap-2 text-[10px] uppercase tracking-widest text-stone-500 font-mono group-hover:text-stone-300">
                          View Threads <ArrowRight className="w-3 h-3" />
                      </div>
                  </a>
              </div>
              <div className="fixed bottom-0 left-0 w-full bg-gradient-to-t from-stone-950 via-stone-950/95 to-transparent pt-12 pb-8 px-8 flex justify-between items-end z-20 pointer-events-none">
                  <button onClick={handleReset} className="px-5 py-2 rounded-full border border-stone-700 bg-stone-950 text-[10px] uppercase tracking-widest text-stone-400 hover:text-stone-200 transition-all pointer-events-auto">Trace Another</button>
                  <button onClick={generateArtifact} className="flex items-center gap-3 px-6 py-3 rounded-full bg-stone-100 text-stone-950 hover:scale-105 transition-all group pointer-events-auto shadow-[0_0_30px_rgba(255,255,255,0.1)]"><Moon className="w-3 h-3 fill-current" /><span className="text-xs font-bold uppercase tracking-widest">Sit with this</span></button>
              </div>
            </div>
          )}

          {view === 'synthesizing' && (
              <div className="flex-grow flex flex-col justify-center items-center animate-in fade-in duration-1000">
                  <div className="relative">
                      <div className="w-16 h-16 border border-stone-800 rounded-full animate-ping absolute opacity-20"></div>
                      <Loader2 className="w-8 h-8 animate-spin text-stone-500" />
                  </div>
                  <div className="mt-8 text-xs tracking-[0.3em] uppercase text-stone-500 animate-pulse">Synthesizing Artifact</div>
              </div>
          )}

          {view === 'artifact' && synthesisImage && data && (
              <div className="flex-grow w-full h-full flex flex-col justify-center items-center px-6 py-8 pb-48 animate-in fade-in zoom-in-95 duration-1000">
                  <div className="flex flex-col items-center justify-center w-full max-w-sm flex-grow">
                      <div className="relative w-full bg-stone-900 shadow-2xl overflow-hidden group border border-stone-800">
                          <div className="aspect-square w-full relative overflow-hidden bg-stone-950">
                             <img src={synthesisImage} alt="Artifact" className="w-full h-full object-cover transition-transform duration-[10s] group-hover:scale-110" />
                          </div>
                          <div className="bg-stone-950 p-6 space-y-4 border-t border-stone-800">
                              <div className="pb-4 mb-2 border-b border-stone-900">
                                <h2 className="text-2xl font-serif text-white leading-none">{data.thematic_key}</h2>
                              </div>
                              <div className="space-y-3">
                                {data.echoes.map((echo, idx) => (
                                    <div key={idx} className="flex justify-between items-start text-[10px] text-stone-500 gap-4">
                                        <span className="uppercase tracking-wider text-stone-400 font-bold text-left">{echo.title}</span>
                                        <span className="font-mono opacity-50 whitespace-nowrap">{echo.year}</span>
                                    </div>
                                ))}
                              </div>
                          </div>
                      </div>
                      <div className="mt-12 flex flex-col gap-4 w-full">
                          <button onClick={handleDownloadCard} className="w-full py-5 bg-stone-100 text-stone-950 font-bold text-xs uppercase tracking-widest rounded-full hover:scale-105 transition-transform shadow-[0_0_20px_rgba(255,255,255,0.1)]">Download Artifact</button>
                          <button onClick={handleReset} className="w-full py-5 bg-transparent border border-stone-700 text-stone-200 font-bold text-xs uppercase tracking-[0.4em] rounded-full hover:bg-stone-200 hover:text-stone-950 transition-all">Trace Another</button>
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