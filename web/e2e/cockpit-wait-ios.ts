// Safari's engine (WebKit) runs the same steady-WAIT checks. It is not a physical-iPhone test.
process.env.WAIT_WEBKIT = '1';
await import('./cockpit-wait.js');
export {};
