import WebSocket from 'ws';

interface AriWebSocketConfig {
  baseUrl: string;
  username: string;
  password: string;
  app: string;
}

export interface AriEvent {
  type: string;
  timestamp?: string;
  application?: string;
  [key: string]: unknown;
}

export interface AriChannel {
  id: string;
  name: string;
  state: string;
  accountcode?: string;
  caller: {
    name: string;
    number: string;
  };
  connected: {
    name: string;
    number: string;
  };
  dialplan: {
    context: string;
    exten: string;
    priority: number;
  };
  creationtime?: string;
  language?: string;
}

type EventHandler = (event: AriEvent) => void | Promise<void>;

const DEFAULT_BASE_URL = process.env.ARI_BASE_URL || 'http://127.0.0.1:8088/ari';
const DEFAULT_USERNAME = process.env.ARI_USERNAME || 'asterisk';
const DEFAULT_PASSWORD = process.env.ARI_PASSWORD || 'asterisk';
const DEFAULT_APP = process.env.ARI_APP || 'asterisk-app';

export class AriWebSocketClient {
  private ws: WebSocket | null = null;
  private config: AriWebSocketConfig;
  private reconnectInterval: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 5000; // 5 seconds
  private eventHandlers: Map<string, Set<EventHandler>> = new Map();
  private isConnecting = false;
  private shouldReconnect = true;

  constructor(config?: Partial<AriWebSocketConfig>) {
    const baseUrl = config?.baseUrl || DEFAULT_BASE_URL;
    const wsBaseUrl = baseUrl.replace(/^http/, 'ws').replace(/\/ari$/, '');
    
    this.config = {
      baseUrl: wsBaseUrl,
      username: config?.username ?? DEFAULT_USERNAME,
      password: config?.password ?? DEFAULT_PASSWORD,
      app: config?.app ?? DEFAULT_APP,
    };
  }

  private buildWebSocketUrl(): string {
    const { baseUrl, username, password, app } = this.config;
    return `${baseUrl}/ari/events?app=${encodeURIComponent(app)}&api_key=${username}:${password}&subscribeAll=true`;
  }

  private handleMessage(data: WebSocket.Data): void {
    try {
      const event: AriEvent = JSON.parse(data.toString());
      
      // Вызываем обработчики для конкретного типа события
      const handlers = this.eventHandlers.get(event.type);
      if (handlers) {
        handlers.forEach((handler) => {
          try {
            handler(event);
          } catch (error) {
            console.error(`[ARI WebSocket] Error in event handler for ${event.type}:`, error);
          }
        });
      }

      // Вызываем обработчики для всех событий ('*')
      const allHandlers = this.eventHandlers.get('*');
      if (allHandlers) {
        allHandlers.forEach((handler) => {
          try {
            handler(event);
          } catch (error) {
            console.error(`[ARI WebSocket] Error in wildcard event handler:`, error);
          }
        });
      }
    } catch (error) {
      console.error('[ARI WebSocket] Failed to parse event:', error);
    }
  }

  private handleError(error: Error): void {
    console.error('[ARI WebSocket] Error:', error);
  }

  private handleClose(): void {
    console.log('[ARI WebSocket] Connection closed');
    this.ws = null;

    if (this.shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`[ARI WebSocket] Reconnecting in ${this.reconnectDelay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      
      this.reconnectInterval = setTimeout(() => {
        this.connect();
      }, this.reconnectDelay);
    } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[ARI WebSocket] Max reconnection attempts reached');
    }
  }

  connect(): Promise<void> {
    if (this.isConnecting || this.ws?.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      if (this.isConnecting) {
        return;
      }

      this.isConnecting = true;
      const url = this.buildWebSocketUrl();
console.log('url', url);
      console.log(`[ARI WebSocket] Connecting to ${url.replace(/:[^:@]+@/, ':****@')}...`);

      try {
        this.ws = new WebSocket(url);

        this.ws.on('open', () => {
          console.log('[ARI WebSocket] Connected');
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          resolve();
        });

        this.ws.on('message', (data) => {
          this.handleMessage(data);
        });

        this.ws.on('error', (error) => {
          this.isConnecting = false;
          this.handleError(error);
          reject(error);
        });

        this.ws.on('close', () => {
          this.isConnecting = false;
          this.handleClose();
        });
      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  disconnect(): void {
    this.shouldReconnect = false;
    
    if (this.reconnectInterval) {
      clearTimeout(this.reconnectInterval);
      this.reconnectInterval = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    console.log('[ARI WebSocket] Disconnected');
  }

  on(eventType: string, handler: EventHandler): void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set());
    }
    this.eventHandlers.get(eventType)!.add(handler);
  }

  off(eventType: string, handler: EventHandler): void {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.eventHandlers.delete(eventType);
      }
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export const ariWebSocket = new AriWebSocketClient();

