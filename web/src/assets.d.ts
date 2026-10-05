// Vite asset URLs (import x from './file.woff2?url')
declare module '*?url' {
  const url: string;
  export default url;
}
