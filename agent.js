import { askLLMWithMessages } from './llmService.js';
import { getUserInput } from './cli-io.js';

// Max LLM calls the agent may make for one user message, so a confused model
// can't loop through tools forever.
const MAX_STEPS = 10;

// ---------- Appointment store ----------
// In-memory calendar: the set of booked slots, keyed by "YYYY-MM-DD HH:mm".
// It lives only while the program runs.
const booked = new Set();

// ---------- Tools (Part 2) ----------
// The model never runs these itself; it asks for one by name and our code calls it.

const checkAvailability = (date) => {
    console.log("Checking availability for date:", date);
    return { available: !booked.has(date) };
};

const scheduleAppointment = (date) => {
    console.log("Scheduling appointment for date:", date);
    if (booked.has(date)) return { success: false, error: 'Slot already booked' };
    booked.add(date);
    return { success: true };
};

const deleteAppointment = (date) => {
    console.log("Deleting appointment for date:", date);
    if (!booked.has(date)) return { success: false, error: 'No appointment at this time' };
    booked.delete(date);
    return { success: true };
};

const tools = { checkAvailability, scheduleAppointment, deleteAppointment };

// ---------- System prompt ----------

// Local "YYYY-MM-DD HH:mm"; the same format the model must use for dates.
const formatDate = (d) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const now = new Date();
const weekday = now.toLocaleDateString('en-US', { weekday: 'long' });

// The model can't know today's date on its own, so "tomorrow at 10AM" only works if we tell it.
const SYSTEM_PROMPT = `You are a scheduling assistant that books, checks and cancels appointments.
Right now it is ${weekday}, ${formatDate(now)} (local time).

## Tools
- checkAvailability(date): is this time slot free? Returns { available: boolean }.
- scheduleAppointment(date): book an appointment. Returns { success: boolean, error?: string }.
- deleteAppointment(date): cancel an existing appointment. Returns { success: boolean, error?: string }.
Dates are always "YYYY-MM-DD HH:mm" in 24-hour local time.

## Reply format
Every reply is exactly one JSON object, with no text before or after it, in one of two shapes:
{ "action": "answerUser", "message": "<what to tell the user>" }
{ "action": "runTool", "tool": "<tool name>", "date": "<YYYY-MM-DD HH:mm>" }
Ask for one tool per reply. After a runTool reply you will receive a message shaped like
{ "toolResult": { "tool": ..., "date": ..., "result": ... } }. It comes from the tool, not from the user.

## How to work
- Check availability before scheduling. If a slot is taken, tell the user and suggest they pick another time.
- To move an appointment: check the new slot, schedule it, and only then delete the old one.
  If the new slot is taken, keep the old appointment and tell the user.
- Only say something was booked, moved or cancelled after the tool result confirms it.
- If the requested date or time is unclear, ask the user instead of guessing.
- When a request is fully done, ask if they need anything else, and mention they can type "exit" to quit.`;

// ---------- Memory (Part 1) ----------
// The model is stateless: this array is everything it "remembers".
// We send all of it on every call.
const memory = [];

const remember = (role, data) => memory.push({ role, content: JSON.stringify(data) });

// ---------- Agent turn (Part 3) ----------
// Handles one user message: keep calling the LLM and running the tools it asks
// for until it answers the user, or until we hit MAX_STEPS.
async function runAgentTurn() {
    for (let step = 0; step < MAX_STEPS; step++) {
        const reply = await askLLMWithMessages(memory, SYSTEM_PROMPT);
        remember('assistant', reply);

        if (reply.action === 'answerUser') {
            console.log(`Agent: ${reply.message}\n`);
            return;
        }

        if (reply.action === 'runTool') {
            const tool = tools[reply.tool];
            const result = tool ? tool(reply.date) : { error: `Unknown tool "${reply.tool}"` };
            remember('user', { toolResult: { tool: reply.tool, date: reply.date, result } });
            continue;
        }

        // Neither shape: tell the model so it can correct itself on the next step.
        remember('user', { error: 'Invalid reply. Use action "answerUser" or "runTool".' });
    }

    // Hit the cap. Store the cutoff in memory too, so next turn the model knows the request wasn't finished.
    const message = `Sorry, I couldn't finish that request within ${MAX_STEPS} steps. Could you try rephrasing it?`;
    remember('assistant', { action: 'answerUser', message });
    console.log(`Agent: ${message}\n`);
}

// ---------- Main loop (Part 1) ----------
async function main() {
    console.log('Scheduling agent. Type "exit" or press Ctrl+C to quit.\n');

    while (true) {
        const userInput = (await getUserInput('You: ')).trim();
        if (!userInput) continue;
        if (userInput.toLowerCase() === 'exit') break;

        const turnStart = memory.length;
        memory.push({ role: 'user', content: userInput });

        try {
            await runAgentTurn();
        } catch (error) {
            // API error or unparseable reply: drop this turn from memory so a half-finished
            // exchange doesn't confuse the model, and let the user try again.
            memory.length = turnStart;
            console.error(`[error] ${error.message}\n`);
        }
    }

    console.log('Bye!');
    process.exit(0);
}

main();
