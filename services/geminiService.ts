import { GoogleGenAI, Type } from "@google/genai";
import { EchoData } from "../types";

export const findEchoesForFeeling = async (feeling: string): Promise<EchoData> => {
  // CRITICAL: Vite requires 'import.meta.env' and the 'VITE_' prefix for browser apps
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error("API Key is missing. Please set VITE_GEMINI_API_KEY in Vercel.");
  }

  const genAI = new GoogleGenAI(apiKey);

  const prompt = `
    The user is expressing this feeling: "${feeling}".
    
    Act as a "Silent Archivist" of human history.
    
    1. SELECTION: Select 1 to 3 existing pieces of human creation that anchor this feeling in reality.
       - IMPORTANT: Ensure global and temporal diversity. Avoid overused Western canon tropes. 
       - Explore ancient history, non-Western art, contemporary digital culture, or obscure avant-garde works.
       - If heavy/complex, return ONLY ONE perfect match.
       - If lighter/multifaceted, return up to 3.
       - Types: Architecture, Poetry, Painting, Song, Movie Scene, Sculpture, Letter, Video Game Environment.
    
    2. CONTENT:
       - NO EXPLANATIONS.
       - Text/Audio: Specific Lyric/Quote.
       - Visuals/Objects: Brief objective description of the resonant aspect.
    
    3. THEMATIC KEY: A single word capturing the essence of the input.
  `;

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      thematic_key: { type: Type.STRING },
      color_hex: { type: Type.STRING, description: "A light, high-contrast hex code for dark backgrounds (pastel/neon)." },
      echoes: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            type: { type: Type.STRING },
            title: { type: Type.STRING },
            creator: { type: Type.STRING },
            year: { type: Type.STRING },
            content: { type: Type.STRING },
          },
          required: ["type", "title", "creator", "year", "content"],
        },
      },
      community_insight: { type: Type.STRING },
      search_query: { type: Type.STRING },
    },
    required: ["thematic_key", "color_hex", "echoes", "community_insight", "search_query"],
  };

  try {
    // Switched to 1.5-flash to avoid the 20-request-per-day limit of the v3 preview
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash", 
      systemInstruction: "You are a poetic curator of the human experience. You find resonance in history, art, and the obscure corners of the world.",
    });

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        temperature: 1.0,
      },
    });

    const text = result.response.text();
    if (!text) throw new Error("The archive returned no data.");

    return JSON.parse(text) as EchoData;
  } catch (error: any) {
    console.error("Gemini Service Error:", error);
    throw error;
  }
};

export const generateEchoArtifact = async (prompt: string): Promise<string> => {
  const seed = Math.floor(Math.random() * 1000000);
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1000&height=1000&nologo=true&seed=${seed}&model=flux`;
};