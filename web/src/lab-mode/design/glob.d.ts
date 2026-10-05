// Vite's import.meta.glob, typed for the DESIGN skin's asset list (the web tsconfig has no
// vite/client types).
interface ImportMeta {
  glob<T = unknown>(pattern: string | string[], options: { eager: true; query?: string; import?: string }): Record<string, T>;
}
