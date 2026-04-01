declare module 'gamedig' {
  export class GameDig {
    static query(options: {
      type: string;
      host: string;
      port: number;
      maxRetries?: number;
      socketTimeout?: number;
    }): Promise<{
      players: Array<{ name?: string; raw?: Record<string, unknown> }>;
      maxplayers: number;
    }>;
  }
}
