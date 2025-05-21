
import { HttpRequest, InvocationContext, HttpResponseInit } from "@azure/functions";
// FIX: Corrected 'from' keyword in import statement. The original '_from_' was a syntax error.
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { GEMINI_MODEL_NAME } from "./constants"; // Assuming constants are co-located or accessible

const API_KEY = process.env.GEMINI_API_KEY_AZURE; // API Key from Azure App Settings

if (!API_KEY && process.env.NODE_ENV !== 'test') { // Check if running in test to avoid error during unit tests
    console.error("FATAL ERROR: GEMINI_API_KEY_AZURE environment variable is not set.");
    // In a real scenario, the function might not even start or fail health checks
    // For now, it will allow the function to load but requests will fail.
}

// FIX: Initialize GoogleGenAI with API_KEY. Ensure process.env.API_KEY is used if this were client-side.
// For Azure function, GEMINI_API_KEY_AZURE is appropriate as named.
const ai = new GoogleGenAI({ apiKey: API_KEY || "MISSING_API_KEY_RUNTIME_AZURE" });

// FIX: Updated function signature for Azure Functions v4 programming model.
// Context is now InvocationContext, HttpRequest is the first parameter.
// Return type is HttpResponseInit. Responses are returned directly.
export async function httpTrigger(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log('HTTP trigger function processed a request for ProcessGroceryList.');

    if (!API_KEY || API_KEY === "MISSING_API_KEY_RUNTIME_AZURE") {
        // FIX: Corrected logging to use context.error directly.
        context.error("Gemini API Key is not configured in Azure Function App Settings.");
        // FIX: Return HttpResponseInit with stringified body and content type header.
        return {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: "Internal server configuration error. API key for AI service is missing." })
        };
    }

    // FIX: Parse request body as JSON. req.body is a ReadableStream in v4 model.
    let parsedBody;
    try {
        parsedBody = await req.json();
    } catch (parseError) {
        // FIX: Corrected logging to use context.warn directly.
        context.warn('Invalid JSON in request body:', parseError);
        return {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: "Request body is not valid JSON." })
        };
    }

    const hindiTranscript = parsedBody?.hindiTranscript;

    if (!hindiTranscript || typeof hindiTranscript !== 'string' || hindiTranscript.trim() === "") {
        // FIX: Return HttpResponseInit with stringified body and content type header.
        return {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: "Please provide a 'hindiTranscript' (string) in the request body." })
        };
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
        // FIX: Ensure contents property is correctly formatted. A string prompt is fine.
        const response: GenerateContentResponse = await ai.models.generateContent({
            model: GEMINI_MODEL_NAME,
            contents: prompt, // Correct usage for single text prompt
            config: {
                responseMimeType: "application/json",
                temperature: 0.2,
            },
        });

        let jsonStr = response.text.trim();
        const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
        const match = jsonStr.match(fenceRegex);
        if (match && match[2]) {
            jsonStr = match[2].trim();
        }

        let parsedGeminiData;
        try {
            parsedGeminiData = JSON.parse(jsonStr);
        } catch (e) {
            // FIX: Corrected logging to use context.error directly.
            context.error("Failed to parse JSON response from Gemini:", e, "Raw response:", response.text);
            // FIX: Return HttpResponseInit with stringified body and content type header.
            return {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: "The AI returned an invalid list format. Please try rephrasing or try again." })
            };
        }
        
        if (Array.isArray(parsedGeminiData) && parsedGeminiData.every(item => typeof item === 'string')) {
            // FIX: Return HttpResponseInit with stringified body and content type header.
            return {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ groceryList: parsedGeminiData })
            };
        } else {
            // FIX: Corrected logging to use context.warn directly.
            context.warn("Gemini response was not a valid array of strings, though JSON was valid:", parsedGeminiData);
            // FIX: Return HttpResponseInit with stringified body and content type header.
            return {
                status: 200, 
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ groceryList: [] }) 
            };
        }

    } catch (error: any) {
        // FIX: Corrected logging to use context.error directly.
        context.error("Error calling Gemini API:", error);
        let errorMessage = "An unknown error occurred while communicating with the AI.";
        let statusCode = 500;

        if (error.message) {
            // Preserve specific error messages
            if (error.message.includes("API key not valid") || error.message.includes("API_KEY_INVALID")) {
                errorMessage = "The configured Gemini API key is invalid. Please check the backend configuration.";
            } else if (error.message.includes("Quota") || error.message.includes("quota")) {
                errorMessage = "The AI service request quota has been exceeded. Please try again later.";
                statusCode = 429; 
            } else if (error.message.includes("timed out") || error.message.includes("timeout")) {
                errorMessage = "The request to the AI service timed out. Please try again.";
                statusCode = 504; 
            } else {
                 errorMessage = error.message; // Use the original error message if not one of the specific cases
            }
        }
        // FIX: Return HttpResponseInit with stringified body and content type header.
        return {
            status: statusCode,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: errorMessage })
        };
    }
}

// Note: Azure Functions v4 model typically uses app.http() to register functions,
// or relies on function.json to point to a named export like 'httpTrigger'.
// If using function.json, ensure it has:
// {
//   "bindings": [
//     {
//       "authLevel": "anonymous", // or as per your requirement
//       "type": "httpTrigger",
//       "direction": "in",
//       "name": "req",
//       "methods": ["post"]
//     },
//     {
//       "type": "http",
//       "direction": "out",
//       "name": "$return"
//     }
//   ],
//   "scriptFile": "../dist/ProcessGroceryList/index.js", // path to compiled JS
//   "entryPoint": "httpTrigger" // name of the exported function
// }
// The 'export default httpTrigger' is from v3 model and is not used here.
// FIX: Removed unused _GEMINI_MODEL_NAME constant previously at the end of the file.