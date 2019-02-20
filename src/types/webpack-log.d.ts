declare module 'webpack-log' {
  export interface Logger {
    info: (value?: any) => void;
    warn: (value?: any) => void;
    error: (value?: any) => void;
    trace: (value?: any) => void;
    debug: (value?: any) => void;
    silent: (value?: any) => void;
  }

  export type Level = 'info' | 'warn' | 'error' | 'trace' | 'debug' | 'silent';

  export default function(options: {
    name: string;
    level?: Level;
    unique?: boolean;
    timestamp?: boolean;
  }): Logger;
}
