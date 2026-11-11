// THE ART LAB on WebKit (the iPhone engine): the same walk as web/e2e/art-lab.ts.
process.env.PW_ENGINE = 'webkit';
await import('./art-lab.js');

export {};
