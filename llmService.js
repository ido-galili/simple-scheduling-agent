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
 * @param messages - Conversation history (the agent's memory):
 *                   [{ role: 'user' | 'assistant', content: '...' }, ...]. Must start with 'user'.
 * @param system   - Optional system prompt: standing instructions, kept separate from the history.
 * @returns The parsed JSON object found in the reply.
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

export const parseJSONFromString = (
    result,
    expectedType, //array or object
) => {
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
