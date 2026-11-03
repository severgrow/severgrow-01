// Extend the existing ten-level real-input course; its production /3/ assertions stay unchanged.
process.env.EXPERIENCE_TEST='1';
process.env.EXPERIENCE_NO_READ='1';
process.env.ONLY='run';
await import('./lessons-3.js');
export {};
