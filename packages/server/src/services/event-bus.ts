import { EventEmitter } from 'events';
import type { WsEvent } from '@gamepanel/shared';

class GamePanelEventBus extends EventEmitter {
  broadcastWs(data: WsEvent): boolean {
    return this.emit('ws:broadcast', data);
  }

  onWsBroadcast(listener: (data: WsEvent) => void): this {
    return this.on('ws:broadcast', listener);
  }
}

export const eventBus = new GamePanelEventBus();
