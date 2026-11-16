// Vite asset URLs (import x from './file.woff2?url')
declare module '*?url' {
  const url: string;
  export default url;
}

// Vite raw text (import svg from './file.svg?raw')
declare module '*?raw' {
  const text: string;
  export default text;
}

declare module '*.webp' {
  const url: string;
  export default url;
}

declare module '*.css' {}
