import React, { useState, useRef, useEffect } from 'react';
import { 
  BookOpen, 
  Music, 
  Film, 
  Loader2, 
  Sparkles, 
  Image as ImageIcon, 
  Ghost, 
  Moon, 
  ArrowRight, 
  ArrowLeft, 
  Compass, 
  MessageCircle, 
  ExternalLink, 
  RefreshCw,
  Archive,
  Volume2,
  VolumeX,
  X,
  Clock
} from 'lucide-react';
import { findEchoesForFeeling, generateEchoArtifact } from '../services/geminiService';
import type { EchoData, HistoryItem } from '../types';

// Constants
const PLACEHOLDERS = [
  "the specific loneliness of 3 AM...",
  "nostalgia for a time I never lived in...",
  "the silence after a loud party...",
  "feeling like a ghost in my own life...",
  "the smell of old books and rain...",
  "waking up and forgetting who I am for a second...",
  "the heavy quiet of a sunday evening...",
  "missing a version of myself that no longer exists...",
  "the urge to disappear into a forest...",
  "overwhelmed by the passage of time...",
  "finding comfort in gray skies...",
  "a sudden, sharp clarity about everything...",
  "the weight of unsaid words...",
  "craving a silence I can't explain..."
];

const DRIFT_CONCEPTS = [
  "The strange comfort of being alone in a crowded room.",
  "A longing for a home you can't return to, or that never was.",
  "The realization that you are currently living in a memory.",
  "The overwhelming awareness of the complexity of everyone's lives.",
  "The desire to care less about things that mean so much.",
  "A sudden moment of clarity in the middle of chaos.",
  "The feeling of wanting to go home when you are already there.",
  "Nostalgia for a conversation you haven't had yet.",
  "The quiet sadness of a friendship slowly fading.",
  "Finding beauty in things that are falling apart.",
  "The anticipation of a future that feels like a memory."
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
  
  // New Features State
  const [isMuted, setIsMuted] = useState(false);
  const [showShoebox, setShowShoebox] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  
  // Refs for Audio
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // --- AUDIO ENGINE (Brown Noise / Tape Hiss) ---
  useEffect(() => {
    let lastOut = 0;

    const initAudio = () => {
      if (audioContextRef.current) return;

      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContext();
      audioContextRef.current = ctx;

      // Create Brown Noise Buffer (Approximation)
      const bufferSize = ctx.sampleRate * 2; // 2 seconds
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);

      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        data[i] = (lastOut + (0.02 * white)) / 1.02; // Brown noise equation
        lastOut = data[i];
        data[i] *= 3.5; // Compensate gain
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;

      // Lowpass Filter for "Muffled/Underwater/Womb" sound
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 400; 

      // Gain (Volume)
      const gain = ctx.createGain();
      gain.gain.value = 0.05; // Very subtle background ambience

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      
      noise.start();

      // Start in suspended state if muted, or user hasn't interacted yet
      if (ctx.state === 'running' && isMuted) {
          ctx.suspend();
      }
    };

    // Initialize audio on first user interaction to bypass autoplay policy
    const handleInteraction = () => {
        if (!audioContextRef.current) {
            initAudio();
        } else if (audioContextRef.current.state === 'suspended' && !isMuted) {
            audioContextRef.current.resume();
        }
    };

    window.addEventListener('click', handleInteraction);
    window.addEventListener('keydown', handleInteraction);

    return () => {
        window.removeEventListener('click', handleInteraction);
        window.removeEventListener('keydown', handleInteraction);
        if (audioContextRef.current) {
            audioContextRef.current.close();
        }
    };
  }, [isMuted]);

  // Handle Mute Toggle
  useEffect(() => {
    if (audioContextRef.current) {
        if (isMuted) {
            audioContextRef.current.suspend();
        } else {
            audioContextRef.current.resume();
        }
    }
  }, [isMuted]);


  // --- HISTORY / SHOEBOX LOGIC ---
  useEffect(() => {
      const savedHistory = localStorage.getItem('echoes_history');
      if (savedHistory) {
          try {
              setHistory(JSON.parse(savedHistory));
          } catch(e) { console.error("History parse error", e); }
      }

      // Restore Active Session
      const savedSession = localStorage.getItem('echoes_active_session');
      if (savedSession) {
          try {
              const parsed = JSON.parse(savedSession);
              if (parsed.data) {
                  setData(parsed.data);
                  setInput(parsed.input || '');
                  setView(parsed.view || 'echo');
                  if (parsed.view === 'artifact' && parsed.synthesisImage) {
                      setSynthesisImage(parsed.synthesisImage);
                  }
              }
          } catch (e) {
              console.error("Failed to restore session", e);
          }
      }
  }, []);

  const saveToShoebox = (newData: EchoData, prompt: string) => {
      const newItem: HistoryItem = {
          id: Date.now().toString(),
          timestamp: Date.now(),
          input: prompt,
          data: newData
      };
      
      const newHistory = [newItem, ...history].slice(0, 50); // Keep last 50
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

  // Save Active Session
  useEffect(() => {
    if (data) {
        localStorage.setItem('echoes_active_session', JSON.stringify({
            data,
            input,
            view,
            synthesisImage
        }));
    }
  }, [data, input, view, synthesisImage]);

  // Placeholder Rotation
  useEffect(() => {
    if (view !== 'input') return;
    const interval = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % PLACEHOLDERS.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [view]);

  // --- DEEP LINK GENERATOR ---
  const getExternalLink = (type: string, title: string, creator: string) => {
      const query = encodeURIComponent(`${title} ${creator}`);
      const t = type.toLowerCase();
      
      if (t.includes('song') || t.includes('music') || t.includes('album')) return `https://open.spotify.com/search/${query}`;
      if (t.includes('film') || t.includes('movie')) return `https://letterboxd.com/search/${query}`;
      if (t.includes('book') || t.includes('novel') || t.includes('poetry')) return `https://www.goodreads.com/search?q=${query}`;
      if (t.includes('paint') || t.includes('art') || t.includes('sculpture')) return `https://artsandculture.google.com/search?q=${query}`;
      
      return `https://www.google.com/search?q=${query}`;
  };

  // --- MAIN LOGIC ---
  const findEcho = async (overrideInput?: string) => {
    const searchTerm = overrideInput || input;
    
    if (!searchTerm || !searchTerm.trim()) return;
    
    setLoading(true);
    setError('');
    setSynthesisImage(null); 

    // ARTIFICIAL BREATHING TIME (Min 1.5s delay)
    const delayPromise = new Promise(resolve => setTimeout(resolve, 1500));
    
    try {
      const [resultData] = await Promise.all([
          findEchoesForFeeling(searchTerm),
          delayPromise
      ]);

      setData(resultData);
      saveToShoebox(resultData, searchTerm);
      setView('echo');
    } catch (err: any) {
      console.error(err);
      setError(err.message || "The archive is silent. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Logic: Synthesize Image Artifact
  const generateArtifact = async () => {
    if (!data) return;

    // Check for API Key selection mandatory for gemini-3-pro-image-preview
    if (window.aistudio) {
      const hasKey = await window.aistudio.hasSelectedApiKey();
      if (!hasKey) {
        await window.aistudio.openSelectKey();
      }
    }
    
    setView('synthesizing');

    const echoInfluences = data.echoes.map(e => `${e.title} (${e.type})`).join(', ');
    const synthesisPrompt = `Abstract conceptual art representing "${data.thematic_key}". Context: ${input}. Artistic influences: ${echoInfluences}. Color palette: ${data.color_hex}. High quality, ethereal lighting, raw texture, no text.`;

    try {
      const imageUrl = await generateEchoArtifact(synthesisPrompt);
      const img = new Image();
      img.src = imageUrl;
      
      img.onload = () => {
         setSynthesisImage(imageUrl);
         setView('artifact');
      };

      img.onerror = () => {
          setError("Unable to render artifact.");
          setView('echo');
      };
    } catch (err) {
      console.error("Artifact gen error:", err);
      setError("Unable to synthesize artifact.");
      setView('echo');
    }
  };

  // Logic: Download Canvas
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
        link.download = `echoes-artifact.png`;
        link.click();
    }
  };

  const handleDrift = () => {
      const randomConcept = DRIFT_CONCEPTS[Math.floor(Math.random() * DRIFT_CONCEPTS.length)];
      setInput(randomConcept);
  };

  const handleReset = () => {
    setData(null);
    setInput('');
    setView('input');
    setSynthesisImage(null);
    localStorage.removeItem('echoes_active_session');
  };

  const handleBack = () => {
    if (view === 'artifact') setView('echo');
    else if (view === 'echo') setView('input');
  };

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
        <div className="absolute top-0 left-0 w-full z-50 px-6 py-6 md:px-8 flex items-center justify-between pointer-events-none">
            <div className="flex items-center gap-4 pointer-events-auto">
                {view !== 'input' && (
                    <button onClick={handleBack} className="opacity-70 hover:opacity-100 transition-opacity p-2 -ml-2"><ArrowLeft className="w-6 h-6 text-stone-300" /></button>
                )}
                <button onClick={handleReset} className="flex items-center gap-2 group">
                    <Sparkles className="w-4 h-4 text-stone-200" />
                    <span className="text-xs tracking-[0.4em] uppercase font-medium text-stone-200">Echoes</span>
                </button>
            </div>
            <div className="flex items-center gap-4 pointer-events-auto">
                <button onClick={() => setIsMuted(!isMuted)} className="p-2 text-stone-500 hover:text-stone-300">
                    {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <button onClick={() => setShowShoebox(true)} className="p-2 text-stone-500 hover:text-stone-300"><Archive className="w-4 h-4" /></button>
            </div>
        </div>

        <div className={`fixed inset-y-0 right-0 w-80 bg-stone-900 border-l border-stone-800 shadow-2xl z-[60] transform transition-transform duration-500 ease-in-out ${showShoebox ? 'translate-x-0' : 'translate-x-full'}`}>
            <div className="p-6 h-full flex flex-col">
                <div className="flex items-center justify-between mb-8">
                    <h2 className="text-sm uppercase tracking-widest text-stone-400 flex items-center gap-2"><Archive className="w-4 h-4" /> The Shoebox</h2>
                    <button onClick={() => setShowShoebox(false)} className="text-stone-500 hover:text-stone-300"><X className="w-5 h-5" /></button>
                </div>
                <div className="flex-grow overflow-y-auto space-y-4">
                    {history.map((item) => (
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

        {view === 'input' && (
          <div className="flex-grow flex flex-col justify-center items-center max-w-2xl mx-auto w-full px-6 animate-in fade-in duration-1000">
            <h1 className="text-3xl md:text-5xl font-light text-stone-200 leading-tight mb-8 text-center">Trace your feeling.</h1>
            <div className="w-full mb-10">
              <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={PLACEHOLDERS[placeholderIndex]} className="w-full bg-transparent border-b border-stone-800 text-xl md:text-2xl py-4 focus:outline-none focus:border-stone-500 transition-colors text-center" onKeyDown={(e) => e.key === 'Enter' && findEcho()} />
            </div>
            <div className="w-full flex flex-col items-center gap-6">
               <button onClick={() => findEcho()} disabled={loading || !input.trim()} className={`w-full max-w-xs py-4 rounded-full font-bold text-xs uppercase tracking-[0.2em] transition-all duration-500 ${input.trim() ? 'bg-stone-200 text-stone-900 hover:scale-105' : 'bg-stone-900 text-stone-600 opacity-0 pointer-events-none'}`}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Trace This Feeling'}
              </button>
              <button onClick={handleDrift} className="text-[10px] text-stone-600 hover:text-stone-400 transition-all uppercase tracking-widest flex items-center gap-2"><Compass className="w-3 h-3" />Drift</button>
              {error && <div className="text-red-400 text-xs text-center">{error}</div>}
            </div>
          </div>
        )}

        {view === 'echo' && data && (
          <div className="flex-grow overflow-y-auto w-full px-4 md:px-8 py-24 animate-in fade-in duration-1000">
            <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 bg-stone-900/40 border border-stone-800/50 p-8 rounded-sm flex flex-col justify-center items-center text-center">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500 mb-4">You Traced</div>
                    <div className="text-2xl md:text-3xl font-serif text-stone-200 leading-tight">"{input}"</div>
                </div>
                <div className="md:col-span-1 bg-stone-900/40 border border-stone-800/50 p-8 rounded-sm flex flex-col justify-center items-center text-center">
                    <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500 mb-2">Resonance Key</div>
                    <div className="text-xl font-medium tracking-widest uppercase" style={{ color: data.color_hex }}>{data.thematic_key}</div>
                </div>
                {data.echoes.map((item, idx) => (
                    <div key={idx} className={`bg-stone-900/40 border border-stone-800/50 p-8 rounded-sm flex flex-col justify-between group ${idx === 0 ? 'md:col-span-2' : 'md:col-span-1'}`}>
                         <div className="mb-6">
                             <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2" style={{ color: data.color_hex }}>{getIcon(item.type)}<span className="text-[10px] uppercase tracking-widest font-semibold">{item.type}</span></div>
                             </div>
                             <blockquote className="text-lg md:text-xl font-serif text-stone-200 leading-relaxed">"{item.content}"</blockquote>
                         </div>
                         <div className="border-t border-stone-800/50 pt-4 mt-auto">
                             <div className="text-xs font-bold text-white tracking-wide">{item.title}</div>
                             <div className="text-[10px] text-stone-500 uppercase tracking-widest mt-1">{item.creator} <span className="text-stone-700 mx-1">/</span> {item.year}</div>
                         </div>
                    </div>
                ))}
                <a href={`https://www.reddit.com/search/?q=${encodeURIComponent(data.search_query || input)}`} target="_blank" rel="noopener noreferrer" className="md:col-span-1 bg-stone-900/20 border border-dashed border-stone-700 p-6 rounded-sm flex flex-col justify-between hover:border-stone-500 transition-all">
                    <div className="flex items-center gap-2 text-stone-400 mb-4"><MessageCircle className="w-4 h-4" /><span className="text-[10px] uppercase tracking-widest">The Human Archive</span></div>
                    <p className="text-sm text-stone-300 leading-relaxed font-mono opacity-80">"{data.community_insight}"</p>
                    <div className="mt-6 flex items-center gap-2 text-[10px] uppercase tracking-widest text-stone-500 font-mono">View Threads <ExternalLink className="w-3 h-3" /></div>
                </a>
            </div>
            <div className="fixed bottom-0 left-0 w-full bg-gradient-to-t from-stone-950 via-stone-950 to-transparent pt-12 pb-8 px-8 flex justify-between items-end z-20 pointer-events-none">
                <button onClick={handleReset} className="px-5 py-2 rounded-full border border-stone-700 bg-stone-950 text-[10px] uppercase tracking-widest text-stone-400 hover:text-stone-200 transition-all pointer-events-auto">Trace Another</button>
                <button onClick={generateArtifact} className="flex items-center gap-3 px-6 py-3 rounded-full bg-stone-100 text-stone-950 hover:scale-105 transition-all shadow-xl pointer-events-auto font-bold uppercase tracking-widest text-xs"><Moon className="w-3 h-3 fill-current" />Sit with this</button>
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
            <div className="flex-grow w-full h-full flex flex-col justify-center items-center px-6 py-24 animate-in fade-in zoom-in-95 duration-1000">
                <div className="flex flex-col items-center justify-center w-full max-w-sm">
                    <div className="relative w-full bg-stone-900 shadow-2xl overflow-hidden border border-stone-800">
                        <img src={synthesisImage} alt="Artifact" className="aspect-square w-full object-cover" />
                        <div className="bg-stone-950 p-6 space-y-3 border-t border-stone-800">
                            <h2 className="text-2xl font-serif text-white leading-none mb-4">{data.thematic_key}</h2>
                            {data.echoes.map((echo, idx) => (
                                <div key={idx} className="flex justify-between items-center text-[10px] text-stone-500">
                                    <span className="uppercase tracking-wider truncate max-w-[180px] text-stone-400">{echo.title}</span>
                                    <span className="font-mono opacity-50">{echo.year}</span>
                                </div>
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
      </div>
    </div>
  );
};

export default Echoes;
