import { GoogleGenAI, Type } from "@google/genai";
import type { EchoData } from "../types";

export const findEchoesForFeeling = async (feeling: string): Promise<EchoData> => {
  // Use process.env.API_KEY as per coding guidelines
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const prompt = `
    The user is expressing this feeling: "${feeling}".
    
    Act as a "Silent Archivist".
    
    1. SELECTION: Select 1 to 3 existing pieces of human creation that anchor this feeling in reality.
       - IMPORTANT: Ensure global and temporal diversity. Avoid overused Western canon tropes.
       - Types: Architecture, Poetry, Painting, Song, Movie Scene, Sculpture, Letter, Video Game Environment.
    
    2. CONTENT: Specific Lyric/Quote or brief objective description.
    
    3. THEMATIC KEY: A single word (e.g. "Entropy").
  `;

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      thematic_key: { type: Type.STRING, description: "A single thematic word capturing the mood." },
      color_hex: { type: Type.STRING, description: "A hex color code representing the emotional color psychology of the feeling. Must be a LIGHT, HIGH-CONTRAST shade." },
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
      model: "gemini-1.5-flash", // Using 1.5-flash for broad compatibility during deployment
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        systemInstruction: "You are a poetic and precise curator of human emotion through art history.",
        temperature: 1.1,
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
  // SWITCHED: Pollinations (No API Key, No Quota). 
  // Kept 'async' to match your interface, even though it's technically synchronous URL building.
  
  try {
    const encodedPrompt = encodeURIComponent(prompt);
    // Using 'flux' model for high quality, similar to Gemini Pro Vision capabilities
    // 'nologo=true' keeps it clean
    const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&model=flux&nologo=true&seed=${Math.floor(Math.random() * 1000000)}`;
    
    // We return the URL directly. 
    // Note: Your frontend will need to use <img src={result} /> instead of base64 data.
    return Promise.resolve(url);
    
  } catch (error: any) {
    console.error("Image Generation Error:", error);
    throw error;
  }
};