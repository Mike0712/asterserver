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
  // Never give up: after an Asterisk restart / longer outage events must come
  // back on their own. Backoff doubles from reconnectDelay up to maxReconnectDelay.
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
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

  /**
   * Runs a handler and contains both sync throws and async rejections —
   * handlers are async, and an escaped rejection kills the whole process.
   */
  private runHandler(handler: EventHandler, event: AriEvent, label: string): void {
    try {
      Promise.resolve(handler(event)).catch((error) => {
        console.error(`[ARI WebSocket] Error in ${label}:`, error);
      });
    } catch (error) {
      console.error(`[ARI WebSocket] Error in ${label}:`, error);
    }
  }

  private handleMessage(data: WebSocket.Data): void {
    let event: AriEvent;
    try {
      event = JSON.parse(data.toString());
    } catch (error) {
      console.error('[ARI WebSocket] Failed to parse event:', error);
      return;
    }

    // Вызываем обработчики для конкретного типа события
    this.eventHandlers.get(event.type)?.forEach((handler) =>
      this.runHandler(handler, event, `event handler for ${event.type}`),
    );

    // Вызываем обработчики для всех событий ('*')
    this.eventHandlers.get('*')?.forEach((handler) =>
      this.runHandler(handler, event, 'wildcard event handler'),
    );
  }

  private handleError(error: Error): void {
    console.error('[ARI WebSocket] Error:', error);
  }

  private handleClose(): void {
    console.log('[ARI WebSocket] Connection closed');
    this.ws = null;

    if (!this.shouldReconnect) return;

    const delay = Math.min(this.reconnectDelay * 2 ** this.reconnectAttempts, this.maxReconnectDelay);
    this.reconnectAttempts++;
    console.log(`[ARI WebSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})...`);

    this.reconnectInterval = setTimeout(() => {
      this.reconnectInterval = null;
      // A failed attempt closes the socket again, which schedules the next
      // one — the rejection itself is expected and must not go unhandled.
      this.connect().catch(() => undefined);
    }, delay);
  }

  connect(): Promise<void> {
    if (this.isConnecting || this.ws?.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }
    this.shouldReconnect = true;

    return new Promise((resolve, reject) => {
      this.isConnecting = true;
      const url = this.buildWebSocketUrl();
      // never log the api_key (user:password)
      console.log(`[ARI WebSocket] Connecting to ${url.replace(/api_key=[^&]*/, 'api_key=****')}...`);

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

