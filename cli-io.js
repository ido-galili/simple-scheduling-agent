import readline from 'readline';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

/**
 * Say goodbye and exit. Bound to Ctrl+C (readline catches it, and without a
 * listener it only pauses input) and to Ctrl+D / end of input ('close').
 *
 * @returns {never}
 */
const quit = () => {
    console.log('\nBye!');
    process.exit(0);
};
rl.on('SIGINT', quit);
rl.on('close', quit);

// Example usage:
/*
    const userInput = await getUserInput('What is your name? ');
    console.log(`Hello, ${userInput}!`);
*/
/**
 * Ask a question in the terminal and wait for the user's answer.
 *
 * @param {string} question - Prompt text shown before the cursor.
 * @returns {Promise<string>} The line the user typed.
 */
export const getUserInput = (question) => {
    return new Promise(resolve => rl.question(question, resolve));
}