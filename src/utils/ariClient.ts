type AriRequestOptions = {
  method?: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: Record<string, unknown> | null;
  signal?: AbortSignal;
};

interface AriClientConfig {
  baseUrl: string;
  username: string;
  password: string;
}

const DEFAULT_BASE_URL = process.env.ARI_BASE_URL || 'http://127.0.0.1:8088/ari';
const DEFAULT_USERNAME = process.env.ARI_USERNAME || 'asterisk';
const DEFAULT_PASSWORD = process.env.ARI_PASSWORD || 'asterisk';

const createAuthHeader = (username: string, password: string): string =>
  `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

const ensureLeadingSlash = (path: string): string =>
  path.startsWith('/') ? path : `/${path}`;

export class AriClient {
  private readonly config: AriClientConfig;
  private readonly authHeader: string;

  constructor(config?: Partial<AriClientConfig>) {
    const baseUrl = config?.baseUrl || DEFAULT_BASE_URL;
    this.config = {
      baseUrl: baseUrl.replace(/\/$/, ''),
      username: config?.username ?? DEFAULT_USERNAME,
      password: config?.password ?? DEFAULT_PASSWORD,
    };

    this.authHeader = createAuthHeader(this.config.username, this.config.password);
  }

  private buildUrl(path: string, query?: AriRequestOptions['query']): string {
    const url = new URL(
      `${this.config.baseUrl}${ensureLeadingSlash(path)}`,
    );

    if (query) {
      Object.entries(query).forEach(([key, value]) => {
        if (value === undefined || value === null) return;
        url.searchParams.set(key, String(value));
      });
    }

    return url.toString();
  }

  private async request<T>(
    path: string,
    options: AriRequestOptions = {},
  ): Promise<T> {
    const { method = 'GET', query, body, signal } = options;
    const url = this.buildUrl(path, query);

    const init: RequestInit = {
      method,
      headers: {
        Authorization: this.authHeader,
        Accept: 'application/json',
      },
      signal,
    };

    if (body) {
      init.headers = {
        ...init.headers,
        'Content-Type': 'application/json',
      };
      init.body = JSON.stringify(body);
    }

    const response = await fetch(url, init);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `ARI request failed: ${response.status} ${response.statusText} – ${text}`,
      );
    }

    if (response.status === 204) {
      // No Content
      return undefined as unknown as T;
    }

    return (await response.json()) as T;
  }

  getBridges() {
    return this.request('/bridges');
  }

  createBridge(options: {
    bridgeId?: string;
    type?: string;
    name?: string;
    template?: string;
  }) {
    const { bridgeId, ...rest } = options;
    const path = bridgeId ? `/bridges/${bridgeId}` : '/bridges';

    return this.request(path, {
      method: 'POST',
      query: rest,
    });
  }

  deleteBridge(bridgeId: string) {
    return this.request(`/bridges/${bridgeId}`, {
      method: 'DELETE',
    });
  }

  getBridge(bridgeId: string) {
    return this.request(`/bridges/${bridgeId}`);
  }

  playMohToBridge(options: {
    bridgeId: string;
    moh: string;
  }) {
    const { bridgeId, moh } = options;
    return this.request(`/bridges/${bridgeId}/moh?mohClass=${moh}`, {
      method: 'POST',
    });
  }

  getChannels() {
    return this.request('/channels');
  }

  addChannelToBridge(options: {
    bridgeId: string;
    channel: string;
    role?: 'participant' | 'agent' | 'chickensoup';
  }) {
    const { bridgeId, channel, role } = options;
    return this.request(`/bridges/${bridgeId}/addChannel`, {
      method: 'POST',
      query: {
        channel,
        role,
      },
    });
  }

  deleteChannel(channelId: string) {
    return this.request(`/channels/${channelId}`, {
      method: 'DELETE',
    });
  }

  removeChannelFromBridge(options: { bridgeId: string; channel: string }) {
    const { bridgeId, channel } = options;
    return this.request(`/bridges/${bridgeId}/removeChannel`, {
      method: 'POST',
      query: {
        channel,
      },
    });
  }

  originateChannel(options: {
    endpoint: string;
    app: string;
    appArgs?: string;
    channelId?: string;
    callerId?: string;
    timeout?: number;
    variables?: Record<string, string>;
  }) {
    const { variables, ...rest } = options;

    return this.request('/channels', {
      method: 'POST',
      query: {
        ...rest,
        variables: variables ? JSON.stringify(variables) : undefined,
      },
    });
  }

  answerChannel(channelId: string) {
    return this.request(`/channels/${channelId}/answer`, {
      method: 'POST',
    });
  }

  ping() {
    return this.request('/asterisk/ping', {
      method: 'GET',
    });
  }
}

export const ariClient = new AriClient();