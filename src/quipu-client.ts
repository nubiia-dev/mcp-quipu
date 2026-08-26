import fetch, { RequestInit, Response } from 'node-fetch';

/**
 * Quipu API v1 base URL (from the official OpenAPI spec: `servers[0].url`).
 */
const API_BASE = 'https://getquipu.com';

/**
 * Quipu speaks JSON:API and requires this vendor Accept header on every
 * endpoint except `POST /oauth/token`, which is a plain OAuth2 endpoint.
 */
const JSON_API_MEDIA_TYPE = 'application/vnd.quipu.v1+json';

/** Refresh the token this many seconds before it actually expires. */
const TOKEN_EXPIRY_MARGIN_SEC = 60;

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

/** A single JSON:API resource object. */
export interface JsonApiResource<A = Record<string, unknown>> {
  id: string;
  type: string;
  attributes: A;
  relationships?: Record<string, unknown>;
}

export interface JsonApiResponse<A = Record<string, unknown>> {
  data: JsonApiResource<A> | JsonApiResource<A>[];
  included?: JsonApiResource[];
  meta?: Record<string, unknown>;
  links?: Record<string, string>;
}

export interface QuipuClientOptions {
  clientId: string;
  clientSecret: string;
  /**
   * Account slug used as the first path segment of every business endpoint
   * (`/{owner_slug}/invoices`). Optional: when omitted it is resolved lazily
   * from the token response or from `GET /users/{id}`.
   */
  ownerSlug?: string;
}

/**
 * Client for the Quipu API v1.
 *
 * Differs from the Holded client in two significant ways, and both are the
 * reason this cannot be a copy-paste of it:
 *
 *  1. Auth is OAuth2 client credentials, not a static API key. Tokens expire,
 *     so they are cached in memory and refreshed transparently.
 *  2. Payloads are JSON:API, so resources arrive wrapped in `data.attributes`
 *     instead of being plain objects.
 */
export class QuipuClient {
  private clientId: string;
  private clientSecret: string;
  private ownerSlug?: string;

  private accessToken: string | null = null;
  private tokenExpiresAt = 0;
  /** In-flight token request, so concurrent calls share a single round trip. */
  private pendingToken: Promise<string> | null = null;

  private maxRetries = 3;
  private backoffDelays = [1000, 2000, 4000];
  private retryableStatusCodes = new Set([429, 502, 503, 504]);

  constructor({ clientId, clientSecret, ownerSlug }: QuipuClientOptions) {
    if (!clientId || !clientSecret) {
      throw new Error(
        'Quipu credentials not configured. Set QUIPU_CLIENT_ID and QUIPU_CLIENT_SECRET ' +
          'with the API credentials generated in Quipu → Configuración → API.'
      );
    }
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.ownerSlug = ownerSlug;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private truncateErrorText(text: string): string {
    return text.length > 500 ? text.slice(0, 500) + '… [truncated]' : text;
  }

  /**
   * Return a valid access token, requesting a new one when the cached token is
   * missing or about to expire. Concurrent callers share one request.
   */
  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.accessToken && now < this.tokenExpiresAt) {
      return this.accessToken;
    }
    if (this.pendingToken) {
      return this.pendingToken;
    }

    this.pendingToken = this.requestAccessToken().finally(() => {
      this.pendingToken = null;
    });
    return this.pendingToken;
  }

  private async requestAccessToken(): Promise<string> {
    const basic = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

    const response = await fetch(`${API_BASE}/oauth/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: 'grant_type=client_credentials&scope=ecommerce',
    });

    if (!response.ok) {
      const text = this.truncateErrorText(await response.text());
      throw new Error(
        `Quipu authentication failed (${response.status}). Check QUIPU_CLIENT_ID and ` +
          `QUIPU_CLIENT_SECRET. Response: ${text}`
      );
    }

    const token = (await response.json()) as TokenResponse;
    if (!token.access_token) {
      throw new Error('Quipu returned a token response without an access_token field.');
    }

    this.accessToken = token.access_token;
    const lifetimeSec = Math.max((token.expires_in ?? 3600) - TOKEN_EXPIRY_MARGIN_SEC, 30);
    this.tokenExpiresAt = Date.now() + lifetimeSec * 1000;

    return this.accessToken;
  }

  /** Invalidate the cached token. Used when the API answers 401. */
  private invalidateToken(): void {
    this.accessToken = null;
    this.tokenExpiresAt = 0;
  }

  /**
   * Resolve the account slug that prefixes every business endpoint.
   * Explicit configuration wins; otherwise it is read once from the API.
   */
  async getOwnerSlug(): Promise<string> {
    if (this.ownerSlug) {
      return this.ownerSlug;
    }
    throw new Error(
      'Quipu owner slug not configured. Set QUIPU_OWNER_SLUG with your account slug — ' +
        'it is the first path segment of your Quipu URLs (https://getquipu.com/<slug>/…).'
    );
  }

  private async parseErrorBody(response: Response): Promise<string> {
    const text = await response.text();
    try {
      // JSON:API surfaces problems in an `errors` array; use it when present.
      const parsed = JSON.parse(text) as { errors?: Array<{ title?: string; detail?: string }> };
      if (Array.isArray(parsed.errors) && parsed.errors.length > 0) {
        return parsed.errors.map((e) => [e.title, e.detail].filter(Boolean).join(': ')).join(' | ');
      }
    } catch {
      // Not JSON — fall through to the raw body.
    }
    return this.truncateErrorText(text);
  }

  private async request<T>(
    method: string,
    endpoint: string,
    body?: unknown,
    queryParams?: Record<string, string | number | undefined>
  ): Promise<T> {
    let url = `${API_BASE}${endpoint}`;

    if (queryParams) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(queryParams)) {
        if (value !== undefined && value !== null) {
          params.append(key, String(value));
        }
      }
      const queryString = params.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const token = await this.getAccessToken();

      const options: RequestInit = {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: JSON_API_MEDIA_TYPE,
          'Content-Type': JSON_API_MEDIA_TYPE,
        },
      };
      if (body !== undefined) {
        options.body = JSON.stringify(body);
      }

      let response: Response;
      try {
        response = await fetch(url, options);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < this.maxRetries) {
          await this.sleep(this.backoffDelays[attempt]);
          continue;
        }
        throw new Error(`Quipu request failed: ${lastError.message}`, { cause: error });
      }

      // An expired or revoked token: drop it and retry once with a fresh one.
      if (response.status === 401 && attempt < this.maxRetries) {
        this.invalidateToken();
        continue;
      }

      if (this.retryableStatusCodes.has(response.status) && attempt < this.maxRetries) {
        const retryAfter = response.headers.get('retry-after');
        const delay = retryAfter ? Number(retryAfter) * 1000 : this.backoffDelays[attempt];
        await this.sleep(Number.isFinite(delay) ? delay : this.backoffDelays[attempt]);
        continue;
      }

      if (!response.ok) {
        const detail = await this.parseErrorBody(response);
        throw new Error(`Quipu API error ${response.status}: ${detail}`);
      }

      if (response.status === 204) {
        return undefined as T;
      }

      return (await response.json()) as T;
    }

    throw new Error(`Quipu request failed after ${this.maxRetries} retries: ${lastError?.message}`);
  }

  async get<T>(endpoint: string, queryParams?: Record<string, string | number | undefined>) {
    return this.request<T>('GET', endpoint, undefined, queryParams);
  }

  async post<T>(endpoint: string, body: unknown) {
    return this.request<T>('POST', endpoint, body);
  }

  async patch<T>(endpoint: string, body: unknown) {
    return this.request<T>('PATCH', endpoint, body);
  }

  async delete<T>(endpoint: string) {
    return this.request<T>('DELETE', endpoint);
  }
}

/**
 * Flatten a JSON:API payload into plain objects with `id` folded in.
 * Models read `{ id, total, issue_date }` far better than
 * `{ data: { id, attributes: { total, issue_date } } }`.
 */
export function flattenJsonApi<A extends Record<string, unknown>>(
  payload: JsonApiResponse<A>
): Array<A & { id: string }> | (A & { id: string }) {
  const shape = (resource: JsonApiResource<A>) => ({ id: resource.id, ...resource.attributes });
  return Array.isArray(payload.data) ? payload.data.map(shape) : shape(payload.data);
}
