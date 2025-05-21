
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { GEMINI_MODEL_NAME } from '../constants';

// Ensure API_KEY is available in the environment.
// The build process or deployment environment MUST set this.
// For local development, you might use a .env file and a bundler like Vite/Webpack that makes it available.
// DO NOT hardcode the API key here.
const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.error("API_KEY for Gemini is not set in environment variables.");
  // This won't stop the app from loading, but API calls will fail.
  // UI should handle this, perhaps by showing a persistent error if API_KEY is missing.
}

const ai = new GoogleGenAI({ apiKey: API_KEY || "MISSING_API_KEY" }); // Fallback to prevent crash if key is missing

export const transcribeAudioAndIdentifyGroceries = async (hindiTranscript: string): Promise<string[]> => {
  if (!API_KEY || API_KEY === "MISSING_API_KEY") {
    throw new Error("Gemini API Key is not configured. Please contact support or check your application setup.");
  }

  const prompt = `
You are an AI assistant specialized in understanding conversations from a kitchen environment.
The following text is a transcript of a conversation in Hindi.
Your task is to:
1. Analyze the conversation.
2. Identify all grocery items that are mentioned as needing to be bought, running low, out of stock, or required for a recipe being discussed soon.
3. Provide a list of these grocery items in English.
4. The output MUST be a JSON array of strings, where each string is a single grocery item. For example: ["milk", "sugar", "tomatoes", "onions"].
5. If no relevant grocery items are found, return an empty JSON array: [].
Do not include any explanations or text outside of the JSON array in your response.

Hindi Conversation Transcript:
"${hindiTranscript}"

JSON Array of Grocery Items (English):
`;

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: GEMINI_MODEL_NAME,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        temperature: 0.2, // Lower temperature for more deterministic, factual output
      },
    });

    let jsonStr = response.text.trim();
    const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
    const match = jsonStr.match(fenceRegex);
    if (match && match[2]) {
      jsonStr = match[2].trim();
    }
    
    try {
      const parsedData = JSON.parse(jsonStr);
      if (Array.isArray(parsedData) && parsedData.every(item => typeof item === 'string')) {
        return parsedData as string[];
      }
      console.warn("Gemini response was not a valid array of strings, though JSON was valid:", parsedData);
      return []; // Return empty if structure is not as expected.
    } catch (e) {
      console.error("Failed to parse JSON response from Gemini:", e, "Raw response:", response.text);
      throw new Error("The AI returned an invalid list format. Please try rephrasing or try again.");
    }

  } catch (error: any) {
    console.error("Error calling Gemini API:", error);
    if (error.message && error.message.includes("API key not valid")) {
        throw new Error("The configured Gemini API key is invalid. Please check your setup.");
    }
    throw new Error(error.message || "An unknown error occurred while communicating with the AI.");
  }
};
    