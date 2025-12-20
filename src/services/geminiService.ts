import { GoogleGenAI, Type } from "@google/genai";
import type { EchoData } from "../types";

export const findEchoesForFeeling = async (feeling: string): Promise<EchoData> => {
  // Use process.env.API_KEY as per coding guidelines
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const prompt = `
    The user is expressing this feeling: "${feeling}".
    
    Act as a "Silent Archivist".
    
    1. SELECTION: Select 1 to 3 existing pieces of human creation that anchor this feeling in reality.
       - IMPORTANT: Ensure global and temporal diversity. Avoid overused Western canon tropes (e.g. Edward Hopper, The Great Gatsby). Explore ancient history, non-Western art, contemporary digital culture, or obscure avant-garde works.
       - Ensure variety. Do not return the same results if the user asks multiple times.
       - If heavy/complex, return ONLY ONE perfect match.
       - If lighter/multifaceted, return up to 3.
       - Types: Architecture, Poetry, Painting, Song, Movie Scene, Sculpture, Letter, Video Game Environment.
    
    2. CONTENT:
       - NO EXPLANATIONS.
       - Text/Audio: Specific Lyric/Quote.
       - Visuals/Objects: Brief objective description.
    
    3. THEMATIC KEY: A single word (e.g. "Entropy").
  `;

  // Define the schema for structured JSON output
  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      thematic_key: { type: Type.STRING, description: "A single thematic word capturing the mood." },
      color_hex: { type: Type.STRING, description: "A hex color code representing the emotional color psychology of the feeling. Must be a LIGHT, HIGH-CONTRAST pastel or neon shade suitable for dark backgrounds (e.g. Cyan for digital isolation, Warm Amber for nostalgia, Pale Grey for emptiness). Do NOT use dark colors." },
      echoes: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            type: { type: Type.STRING, description: "Type of art (e.g., Poetry, Song, Painting)" },
            title: { type: Type.STRING },
            creator: { type: Type.STRING },
            year: { type: Type.STRING },
            content: { type: Type.STRING, description: "Quote or brief description" },
          },
          required: ["type", "title", "creator", "year", "content"],
        },
      },
      community_insight: { type: Type.STRING, description: "A specific observation about this feeling." },
      search_query: { type: Type.STRING, description: "Optimized search query for this feeling." },
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
        systemInstruction: "You are a poetic and precise curator of human emotion through art history.",
        temperature: 1.1, // Slightly higher for creativity
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("No response from AI");
    }

    return JSON.parse(text) as EchoData;
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};

export const generateEchoArtifact = async (prompt: string): Promise<string> => {
  // Directly use Pollinations.ai (Flux model) - Free, Unlimited, Stable
  const seed = Math.floor(Math.random() * 1000000);
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1000&height=1000&nologo=true&seed=${seed}&model=flux`;
};