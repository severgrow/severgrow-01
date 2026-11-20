// Safari's engine (WebKit) runs the same ROOM-LIGHT checks. It is not a physical-iPhone test.
process.env.ROOM_WEBKIT = '1';
await import('./room-light.js');
export {};
