/** Minimal Deno globals used by the Edge entry (keeps Node typecheck happy). */
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

declare module 'postgres' {
  type Row = Record<string, unknown>;
  type Sql = {
    unsafe(text: string, values?: readonly unknown[]): Promise<readonly Row[]>;
    reserve(): Promise<{
      unsafe(text: string, values?: readonly unknown[]): Promise<readonly Row[]>;
      release(): void;
    }>;
  };
  type Options = {
    prepare?: boolean;
    max?: number;
    idle_timeout?: number;
    connect_timeout?: number;
    ssl?: 'require' | boolean | object;
  };
  export default function postgres(url: string, options?: Options): Sql;
}
