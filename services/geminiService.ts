import { GoogleGenAI, Type } from "@google/genai";
import { EchoData } from "../types";

export const findEchoesForFeeling = async (feeling: string): Promise<EchoData> => {
  // Use gemini-2.5-flash as explicitly requested for high-performance content generation
  const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_API_KEY });

  const prompt = `
    The user is expressing this feeling: "${feeling}".
    
    Act as a "Poetic Archivist".
    
    1. SELECTION: Select 1 to 3 existing pieces of human creation (art, music, literature, obscure artifacts) that resonate with this specific feeling.
       - Ensure global diversity.
       - Types: Poetry, Experimental Sound, Modern Painting, Avant-garde Cinema, Ancient Philosophy.
    
    2. THEMATIC KEY: A single powerful word capturing the essence.
    
    3. COLOR: A light, high-contrast hex code for dark backgrounds (Pastel/Neon).
  `;

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      thematic_key: { type: Type.STRING },
      color_hex: { type: Type.STRING },
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
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash", 
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        systemInstruction: "You are a poetic curator of human history. Respond only with valid JSON.",
        temperature: 0.9,
      },
    });

    const text = response.text;
    if (!text) throw new Error("The archive is silent.");

    return JSON.parse(text) as EchoData;
  } catch (error: any) {
    console.error("Gemini Text Error:", error);
    throw error;
  }
};

export const generateEchoArtifact = async (prompt: string): Promise<string> => {
  // Directly using Pollinations.ai with the Flux model as requested.
  // This removes dependency on Gemini's image generation quotas and billing.
  const seed = Math.floor(Math.random() * 1000000);
  const encodedPrompt = encodeURIComponent(prompt);
  return `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true&model=flux&seed=${seed}`;
};
