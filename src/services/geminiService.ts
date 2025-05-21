
import { GEMINI_MODEL_NAME } from '../constants'; // Keep if needed for other things, or remove if solely for this

// The URL of your deployed Azure Function.
// You will get this URL after deploying your Azure Function.
// For local development, you might use a local Azure Functions runtime URL (e.g., http://localhost:7071/api/ProcessGroceryList)
const AZURE_FUNCTION_URL = "YOUR_AZURE_FUNCTION_URL_HERE"; // <<< IMPORTANT: REPLACE THIS

export const transcribeAudioAndIdentifyGroceries = async (hindiTranscript: string): Promise<string[]> => {
  if (AZURE_FUNCTION_URL === "YOUR_AZURE_FUNCTION_URL_HERE" && import.meta.env.PROD) {
    console.error("Azure Function URL is not configured. Please update src/services/geminiService.ts");
    throw new Error("Application is not configured to connect to the backend service. Please contact support.");
  }
   if (!hindiTranscript || hindiTranscript.trim() === "") {
    console.warn("Empty transcript provided to transcribeAudioAndIdentifyGroceries");
    return []; // No need to call backend for empty transcript
  }

  try {
    const response = await fetch(AZURE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ hindiTranscript: hindiTranscript }),
    });

    if (!response.ok) {
      // Try to parse error message from backend if available
      let errorData;
      try {
        errorData = await response.json();
      } catch (e) {
        // Ignore if error response is not JSON
      }
      const errorMessage = errorData?.error || `Error calling backend: ${response.status} ${response.statusText}`;
      console.error("Error from backend:", errorMessage, errorData);
      throw new Error(errorMessage);
    }

    const data = await response.json();
    if (Array.isArray(data.groceryList) && data.groceryList.every((item: any) => typeof item === 'string')) {
      return data.groceryList as string[];
    } else {
      console.warn("Backend response was not a valid array of strings:", data);
      return []; // Return empty if structure is not as expected.
    }

  } catch (error: any) {
    console.error("Error communicating with the backend service:", error);
    // Avoid exposing too much detail from raw network errors to the user
    // The specific error from the 'if (!response.ok)' block is usually more informative.
    if (error.message.startsWith("Application is not configured") || error.message.startsWith("Error calling backend:")) {
        throw error;
    }
    throw new Error("Failed to get grocery list. Please check your connection or try again later.");
  }
};
