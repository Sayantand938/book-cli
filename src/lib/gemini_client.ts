import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import {
  API_KEYS_STRING,
  MODEL_NAME,
  ENV_VAR_MISSING_ERROR,
  NO_VALID_API_KEYS_ERROR,
  REPHRASE_PROMPT_TEMPLATE,
} from './constants.js';

// --- Helper Functions ---

function validateEnvironmentVariables(): string[] {
  if (!API_KEYS_STRING) {
    console.error(ENV_VAR_MISSING_ERROR);
    process.exit(1);
  }

  const apiKeys = API_KEYS_STRING.split(',')
    .map((key) => key.trim())
    .filter((key) => key !== '');

  if (apiKeys.length === 0) {
    console.error(NO_VALID_API_KEYS_ERROR);
    process.exit(1);
  }

  return apiKeys;
}

const API_KEYS = validateEnvironmentVariables();
let currentApiKeyIndex = 0;

function getNextApiKey(): string {
  const apiKey = API_KEYS[currentApiKeyIndex];
  currentApiKeyIndex = (currentApiKeyIndex + 1) % API_KEYS.length; // Cycle through API keys
  return apiKey;
}

function createModel(apiKey: string): GenerativeModel {
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({ model: MODEL_NAME });
}

async function rephraseTextWithGemini(
  model: GenerativeModel,
  text: string
): Promise<string> {
  const prompt = REPHRASE_PROMPT_TEMPLATE.replace('{text}', text);

  const result = await model.generateContent(prompt);
  return result.response.text();
}

// --- Main Function ---

export async function processChunk(chunk: string[]): Promise<string[]> {
  let attempt = 0;
  const maxAttempts = 3; // Define a maximum number of retry attempts
  const retryDelayMs = 1000; // Delay between retries in milliseconds

  while (attempt < maxAttempts) {
    attempt++;
    const apiKey = getNextApiKey(); // Get a new API key for each attempt
    const model = createModel(apiKey);
    const text = chunk.join('\n\n');

    try {
      const rephrasedText = await rephraseTextWithGemini(model, text);
      const rephrasedParagraphs = rephrasedText
        .split('\n\n')
        .filter((p) => p.trim() !== '');
      return rephrasedParagraphs;
    } catch (error) {
      // Safely handle the error object
      let errorMessage = 'Unknown error';
      if (error instanceof Error) {
        errorMessage = error.message || errorMessage;
      }

      console.error(`Attempt ${attempt} failed:`, errorMessage);

      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      } else {
        console.error('Max retry attempts reached. Exiting.');
        throw error; // Re-throw the original error after max attempts
      }
    }
  }

  throw new Error('Unexpected error during processing.');
}