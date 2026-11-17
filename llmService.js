import Anthropic from '@anthropic-ai/sdk';
import JSON5 from 'json5';
import 'dotenv/config';

// LLM access for the agent. Callers only see askLLMWithMessages, so the
// provider behind it (currently Claude, via the Anthropic SDK) can be swapped
// without touching agent.js. ANTHROPIC_API_KEY is read from .env.

const client = new Anthropic();
const MODEL = 'claude-opus-5-5';

// Example usage:
/*
    const llmResponse = await askLLMWithMessages(
        [{ role: 'user', content: 'What is your name?' }],
        'Always respond in valid JSON: {"name": "..."}',
    );

    console.log(`My name is ${llmResponse.name}`);
*/

/**
 * Send a conversation to the LLM and get back the JSON object from its reply.
 *
 * @param {{ role: 'user' | 'assistant', content: string }[]} messages - Conversation history
 *   (the agent's memory). Must start with a 'user' message.
 * @param {string} [system] - System prompt: standing instructions, kept separate from the history.
 * @returns {Promise<object>} The parsed JSON object found in the reply.
 * @throws If the API call fails, the model declines, or the reply contains no JSON.
 */
export const askLLMWithMessages = async (messages, system) => {
    const response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        output_config: { effort: 'low' }, // quick replies for a terminal chat
        // If the model declines for safety reasons, retry on a fallback model instead of just stopping.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system,
        messages,
    });

    if (response.stop_reason === 'refusal') {
        throw new Error(`LLM declined: ${response.stop_details?.explanation ?? 'no reason given'}`);
    }

    const text = response.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('');

    return parseJSONFromString(text, 'object');
};

/**
 * Extract and parse the JSON object or array in a string, ignoring any text
 * around it (models sometimes wrap JSON in prose or ```json fences).
 *
 * @param {string} result - Text that contains JSON.
 * @param {'object' | 'array'} expectedType - Whether to look for {...} or [...].
 * @returns {any} The parsed value.
 * @throws If no JSON of the expected type is found, or it fails to parse.
 */
export const parseJSONFromString = (result, expectedType) => {
    const [startChar, endChar] = expectedType === 'object' ? ['{', '}'] : ['[', ']'];

    const start = result.indexOf(startChar);
    const end = result.lastIndexOf(endChar);

    if (start === -1 || end === -1) {
        const stringifiedResult = JSON.stringify(result);

        console.error(`Bad JSON result
      \nresultStart:${stringifiedResult.slice(0, 500)}
      \nresultEnd: ${stringifiedResult.slice(stringifiedResult.length - 500)}
      `);

        throw new Error(`Unable to locate JSON (${expectedType})`);
    }

    return JSON5.parse(result.slice(start, end + 1));
};
