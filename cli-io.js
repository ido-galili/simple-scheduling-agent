import readline from 'readline';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Ctrl+C: readline catches it, and without a listener it only pauses input. Exit cleanly instead.
// 'close' also covers Ctrl+D (end of input).
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
export const getUserInput = (question) => {
    return new Promise(resolve => rl.question(question, resolve));
}