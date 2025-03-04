import OpenAI from "openai";
import "dotenv/config";

// --- Configuration (Constants) ---
const API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";
const DEFAULT_MODEL = "gemini-2.0-flash";
const MAX_ATTEMPTS = 30;
const INITIAL_DELAY_MS = 1000;
const PROMPT =
  "Rewrite the text in clear and simple English while keeping the meaning the same. Use natural sentence flow and replace difficult words with easier ones. Make sure the text is easy to understand, especially for non-native English speakers, while maintaining readability and clarity. In your reply, only provide the refined text.";

// --- Helper Function: Exponential Backoff ---
async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Class: API Key Manager ---
class ApiKeyManager {
  constructor(apiKeyString) {
    if (!apiKeyString) {
      throw new Error("GEMINI_API_KEYS environment variable is not set.");
    }
    this.apiKeys = apiKeyString.split(",").map((key) => key.trim());
    if (this.apiKeys.length === 0) {
      throw new Error("No API keys found in GEMINI_API_KEYS.");
    }
    this.currentKeyIndex = 0;
    this.totalKeys = this.apiKeys.length; // Store total number of keys
  }

  getKey() {
    const key = this.apiKeys[this.currentKeyIndex];
    // Move to the next key for the *next* call.  This ensures round-robin.
    this.currentKeyIndex = (this.currentKeyIndex + 1) % this.totalKeys;
    return key;
  }
}

// --- Main Function: Refine Text with Gemini ---
export async function refineTextWithGemini(chunk) {
  // Initialize API Key Manager
  const apiKeyManager = new ApiKeyManager(process.env.GEMINI_API_KEYS);

  let attempts = 0;
  let currentDelay = INITIAL_DELAY_MS;

  while (attempts < MAX_ATTEMPTS) {
    const apiKey = apiKeyManager.getKey(); // Get the next API key
    const openai = new OpenAI({
      apiKey: apiKey,
      baseURL: API_BASE_URL,
    });

    try {
      const response = await openai.chat.completions.create({
        model: DEFAULT_MODEL,
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: `${PROMPT}\n\n${chunk}` },
        ],
      });

      if (response?.choices?.[0]?.message?.content) {
        return response.choices[0].message.content;
      } else {
        console.warn(
          `Unexpected response from Gemini API (Key ${apiKeyManager.currentKeyIndex}):`,
          response
        ); // Key index logged
        // Don't return; continue to the next key.
      }
    } catch (error) {
      console.error(
        `Attempt ${attempts + 1} (Key Index ${
          apiKeyManager.currentKeyIndex
        }) failed: ${error.message}`
      );

      attempts++;

      // Check if all keys have been tried in this attempt cycle
      if (attempts % apiKeyManager.totalKeys === 0) {
        // All keys failed; apply exponential backoff
        console.log(
          `All keys failed.  Retrying in ${currentDelay / 1000} seconds...`
        );
        await delay(currentDelay);
        currentDelay *= 2; // Double the delay
      }
    }
  }

  console.error("Max attempts exceeded. Returning original chunk.");
  return chunk;
}
