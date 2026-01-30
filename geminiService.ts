
import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { ItemType, SmartAction } from "./types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getSmartAnalysis = async (type: ItemType, content: string, fileName?: string): Promise<{ insight: string, actions: SmartAction[], refinedType: ItemType }> => {
  try {
    const model = 'gemini-3-flash-preview';
    
    const prompt = `System: You are the P2C Quantum Bridge AI.
    Analyze this ${type} transfer: "${content.substring(0, 500)}".
    
    Tasks:
    1. Concise insight (max 12 words).
    2. Refine category: 'contact', 'address', 'link', 'video', 'image', or 'text'.
    3. Exactly 2 context-aware actions (label and icon name).
    
    Return JSON only.`;

    const response: GenerateContentResponse = await ai.models.generateContent({
      model,
      contents: type === 'image' ? {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: content.split(',')[1] || content } },
          { text: prompt }
        ]
      } : { parts: [{ text: prompt }] },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            insight: { type: Type.STRING },
            refinedType: { type: Type.STRING },
            actions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  label: { type: Type.STRING },
                  icon: { type: Type.STRING }
                }
              }
            }
          },
          required: ["insight", "refinedType", "actions"]
        }
      }
    });

    const result = JSON.parse(response.text || '{}');
    return {
      insight: result.insight || "Packet verified and relayed successfully.",
      actions: result.actions || [{ label: "Copy Content", icon: "copy" }],
      refinedType: (result.refinedType?.toLowerCase() as ItemType) || type
    };
  } catch (error) {
    console.error("AI Bridge Error:", error);
    return { 
      insight: "Data segment relayed to secure mesh.", 
      actions: [{ label: "Copy Content", icon: "copy" }], 
      refinedType: type 
    };
  }
};
