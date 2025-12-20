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
  "finding comfort in gray skies...",
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
          try { setHistory(JSON.parse(savedHistory)); } catch(e) { console.error("History parse error", e); }
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

  const findEcho = async (overrideInput?: string) => {
    const searchTerm = overrideInput || input;
    if (!searchTerm || !searchTerm.trim()) return;
    setLoading(true);
    setError('');
    const delayPromise = new Promise(resolve => setTimeout(resolve, 2000));
    try {
      const [resultData] = await Promise.all([ findEchoesForFeeling(searchTerm), delayPromise ]);
      setData(resultData);
      saveToShoebox(resultData, searchTerm);
      setView('echo');
    } catch (err: any) {
      console.error(err);
      setError("The archive could not be reached. Ensure your API key is correctly configured in your environment.");
    } finally { setLoading(false); }
  };

  const generateArtifact = async () => {
    if (!data) return;
    setView('synthesizing');
    const echoInfluences = data.echoes.map(e => `${e.title} (${e.type})`).join(', ');
    const synthesisPrompt = `Abstract art for: "${data.thematic_key}". Influences: ${echoInfluences}. Color palette: ${data.color_hex}.`;
    try {
      const imageUrl = await generateEchoArtifact(synthesisPrompt);
      setSynthesisImage(imageUrl);
      setView('artifact');
    } catch (err) {
      setError("Unable to synthesize artifact.");
      setView('echo');
    }
  };

  const handleReset = () => { setData(null); setInput(''); setView('input'); setSynthesisImage(null); setError(''); };

  const getIcon = (type: string) => {
    const t = type.toLowerCase();
    if (t.includes('book') || t.includes('poetry')) return <BookOpen className="w-4 h-4" />;
    if (t.includes('song') || t.includes('music')) return <Music className="w-4 h-4" />;
    if (t.includes('film') || t.includes('movie')) return <Film className="w-4 h-4" />;
    return <Ghost className="w-4 h-4" />;
  };

  return (
    <div className="min-h-screen bg-stone-950 text-stone-200 font-serif overflow-hidden relative">
      <div className="fixed inset-0 pointer-events-none z-0">
        {view === 'artifact' && synthesisImage && (
            <div className="absolute inset-0 z-0 opacity-20 scale-110 blur-3xl transition-opacity duration-[2000ms]">
                <img src={synthesisImage} className="w-full h-full object-cover" alt="Background" />
            </div>
        )}
      </div>

      <div className="z-10 w-full min-h-screen relative flex flex-col">
        <header className="px-6 py-6 md:px-8 flex items-center justify-between">
            <div className="flex items-center gap-4">
                {view !== 'input' && (
                    <button onClick={() => setView('input')} className="opacity-70 hover:opacity-100 p-2 -ml-2"><ArrowLeft className="w-6 h-6 text-stone-300" /></button>
                )}
                <button onClick={handleReset} className="flex items-center gap-2 group">
                    <Sparkles className="w-4 h-4 text-stone-200" />
                    <span className="text-xs tracking-[0.4em] uppercase font-medium">Echoes</span>
                </button>
            </div>
            <div className="flex items-center gap-4">
                <button onClick={() => setIsMuted(!isMuted)} className="p-2 text-stone-500 hover:text-stone-300">
                    {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <button onClick={() => setShowShoebox(true)} className="p-2 text-stone-500 hover:text-stone-300"><Archive className="w-4 h-4" /></button>
            </div>
        </header>

        <main className="flex-grow flex flex-col justify-center">
          {view === 'input' && (
            <div className="max-w-2xl mx-auto w-full px-6 text-center">
              <h1 className="text-4xl md:text-5xl font-light text-stone-100 mb-8">Trace your feeling.</h1>
              <input 
                value={input} 
                onChange={(e) => setInput(e.target.value)} 
                placeholder={PLACEHOLDERS[placeholderIndex]} 
                className="w-full bg-transparent border-b border-stone-800 text-xl md:text-2xl py-4 focus:outline-none focus:border-stone-500 transition-colors text-center font-serif" 
                onKeyDown={(e) => e.key === 'Enter' && findEcho()} 
              />
              <div className="mt-12 flex flex-col items-center gap-4">
                <button onClick={() => findEcho()} disabled={loading || !input.trim()} className={`px-12 py-4 rounded-full font-bold text-xs uppercase tracking-[0.2em] transition-all bg-stone-100 text-stone-900 hover:scale-105 ${!input.trim() ? 'opacity-20 pointer-events-none' : ''}`}>
                    {loading ? 'Tracing...' : 'Trace This Feeling'}
                </button>
                {error && <div className="text-red-400 text-xs mt-4 max-w-sm">{error}</div>}
              </div>
            </div>
          )}

          {view === 'echo' && data && (
            <div className="max-w-5xl mx-auto w-full px-6 py-12 overflow-y-auto">
               <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="md:col-span-2 bg-stone-900/40 border border-stone-800 p-8 rounded-sm">
                      <div className="text-[10px] uppercase tracking-widest text-stone-500 mb-4">The Feeling</div>
                      <div className="text-2xl italic">"{input}"</div>
                  </div>
                  <div className="bg-stone-900/40 border border-stone-800 p-8 rounded-sm text-center flex flex-col justify-center">
                      <div className="text-[10px] uppercase tracking-widest text-stone-500 mb-2">Resonance</div>
                      <div className="text-xl tracking-[0.2em] uppercase font-bold" style={{ color: data.color_hex }}>{data.thematic_key}</div>
                  </div>
                  {data.echoes.map((echo, i) => (
                    <div key={i} className={`bg-stone-900/40 border border-stone-800 p-8 rounded-sm flex flex-col justify-between ${i === 0 ? 'md:col-span-2' : ''}`}>
                        <div>
                            <div className="flex items-center gap-2 mb-4" style={{ color: data.color_hex }}>{getIcon(echo.type)} <span className="text-[10px] uppercase tracking-widest">{echo.type}</span></div>
                            <blockquote className="text-xl mb-6">"{echo.content}"</blockquote>
                        </div>
                        <div className="border-t border-stone-800 pt-4">
                            <div className="text-xs font-bold text-stone-200">{echo.title}</div>
                            <div className="text-[10px] text-stone-500 uppercase mt-1">{echo.creator} / {echo.year}</div>
                        </div>
                    </div>
                  ))}
               </div>
               <div className="mt-12 flex justify-center gap-4">
                    <button onClick={handleReset} className="px-8 py-3 rounded-full border border-stone-800 text-xs uppercase tracking-widest text-stone-500 hover:text-stone-200">Reset</button>
                    <button onClick={generateArtifact} className="px-8 py-3 rounded-full bg-stone-100 text-stone-950 text-xs font-bold uppercase tracking-widest">Sit with this</button>
               </div>
            </div>
          )}

          {view === 'synthesizing' && (
              <div className="text-center animate-pulse">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto text-stone-500 mb-4" />
                  <div className="text-[10px] uppercase tracking-[0.3em] text-stone-500">Synthesizing Artifact</div>
              </div>
          )}

          {view === 'artifact' && synthesisImage && data && (
              <div className="max-w-sm mx-auto w-full px-6 text-center">
                  <div className="bg-stone-900 border border-stone-800 shadow-2xl">
                      <img src={synthesisImage} className="w-full aspect-square object-cover" alt="Artifact" />
                      <div className="p-8 text-left">
                          <h2 className="text-2xl mb-4">{data.thematic_key}</h2>
                          {data.echoes.map((e, idx) => (
                              <div key={idx} className="text-[10px] text-stone-500 uppercase flex justify-between mb-1">
                                  <span>{e.title}</span>
                                  <span>{e.year}</span>
                              </div>
                          ))}
                      </div>
                  </div>
                  <button onClick={handleReset} className="mt-12 text-xs uppercase tracking-widest text-stone-500 hover:text-stone-200">Trace Another Feeling</button>
              </div>
          )}
        </main>
      </div>

      <div className={`fixed inset-y-0 right-0 w-80 bg-stone-900 border-l border-stone-800 z-[60] transform transition-transform ${showShoebox ? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="p-8">
              <div className="flex items-center justify-between mb-8">
                  <div className="text-xs uppercase tracking-widest text-stone-500">History</div>
                  <button onClick={() => setShowShoebox(false)}><X className="w-4 h-4 text-stone-500" /></button>
              </div>
              <div className="space-y-4">
                  {history.map((item) => (
                      <button key={item.id} onClick={() => loadFromShoebox(item)} className="w-full text-left p-4 bg-stone-950/50 border border-stone-800 hover:border-stone-600 rounded-sm">
                          <div className="text-[10px] text-stone-600 font-mono mb-1">{new Date(item.timestamp).toLocaleDateString()}</div>
                          <div className="text-stone-300 font-serif">{item.data.thematic_key}</div>
                      </button>
                  ))}
              </div>
          </div>
      </div>
      {showShoebox && <div onClick={() => setShowShoebox(false)} className="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm" />}
    </div>
  );
};

export default Echoes;