import { EventEmitter } from 'events';
import type { WsEvent } from '@gamepanel/shared';

class GamePanelEventBus extends EventEmitter {
  emit(event: 'ws:broadcast', data: WsEvent): boolean;
  emit(event: string, ...args: unknown[]): boolean {
    return super.emit(event, ...args);
  }

  on(event: 'ws:broadcast', listener: (data: WsEvent) => void): this;
  on(event: string, listener: (...args: unknown[]) => void): this {
    return super.on(event, listener);
  }
}

export const eventBus = new GamePanelEventBus();
