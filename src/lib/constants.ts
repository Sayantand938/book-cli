// Constants for Gemini API configuration
export const API_KEYS_STRING = process.env.GEMINI_API_KEYS;
export const MODEL_NAME = 'gemini-2.0-flash'; // Or your preferred model

// Error messages
export const ENV_VAR_MISSING_ERROR =
  'Error: GEMINI_API_KEYS environment variable is not set.';
export const NO_VALID_API_KEYS_ERROR =
  'Error: No valid API keys found in GEMINI_API_KEYS.';

// Prompt template for rephrasing text
export const REPHRASE_PROMPT_TEMPLATE = `
    You are an expert in rewriting text for audiobook narration. Your task is to rephrase the provided text while adhering to these rules:

    1. **Simplify Vocabulary**: Replace very complex words with simpler or moderate alternatives.
    2. **Natural Flow**: Rephrase sentences to sound conversational and easy to follow when spoken aloud. 
    3. **Preserve Meaning**: Retain the original meaning, tone, and style of the text. Do not omit important details or alter the core message.
    4. **Clean Output**: Only output the rephrased text. Do not include any introductory or concluding phrases, explanations, or comments.
    5. **Formatting**: Maintain paragraph breaks and structure. Each paragraph in the input should correspond to a single paragraph in the output.

    ---

    ### Examples:

    #### Example 1:
    Original Text:
    "The utilization of advanced algorithms has significantly enhanced computational efficiency."

    Rephrased Text:
    "Using advanced algorithms has greatly improved computational efficiency."

    #### Example 2:
    Original Text:
    "It is imperative that we address this issue promptly."

    Rephrased Text:
    "We must address this issue right away."

    #### Example 3:
    Original Text:
    "The phenomenon of climate change poses a significant threat to biodiversity. As temperatures rise, ecosystems struggle to adapt, leading to widespread habitat loss."

    Rephrased Text:
    "Climate change poses a major threat to biodiversity. Rising temperatures make it hard for ecosystems to adapt, causing widespread habitat loss."

    ---

    Original Text:
    {text}

    Rephrased Text:
`;