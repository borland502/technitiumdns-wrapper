import { getEndpointDefinition } from "./endpoints";
import type {
  ApiCallResult,
  ApiCallOptions,
  HeaderRecord,
  LoginResponse,
  SessionInfoResponse,
  DashboardStatsResponse,
  PaginatedZoneList,
  ZoneRecordListResponse,
  CachedZoneList,
  AllowedZoneList,
  BlockedZoneList,
  LogListResponse,
  DnsResolveResponse,
  TechnitiumConfigAuth,
  QueryParams,
} from "./types";
import {
  TechnitiumApiError,
  TechnitiumConfigurationError,
  TechnitiumHttpError,
  TechnitiumTimeoutError,
} from "./errors";

const DEFAULT_TIMEOUT_MS = 15_000;

type EndpointDefinition = ReturnType<typeof getEndpointDefinition>;

export interface TechnitiumClientApiOptions {
  readonly baseUrl: string;
  readonly defaultHeaders?: HeaderRecord;
  readonly timeoutMs?: number;
}

export interface TechnitiumClientOptions {
  readonly api: TechnitiumClientApiOptions;
  readonly auth?: TechnitiumConfigAuth;
  readonly defaultHeaders?: HeaderRecord;
  readonly fetchImplementation?: typeof fetch;
}

export interface LoginOptions {
  readonly username?: string;
  readonly password?: string;
  readonly totp?: string;
  readonly includeInfo?: boolean;
}

export interface SessionTokenSnapshot {
  readonly token?: string;
  readonly source: "explicit" | "config" | "login" | "unknown";
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}

function isJsonLike(contentType: string | null): boolean {
  return Boolean(contentType && contentType.includes("json"));
}

function toQueryStringValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((entry) => toQueryStringValue(entry)).join(",");
  }

  if (value === true) {
    return "true";
  }

  if (value === false) {
    return "false";
  }

  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
}

function resolveBody(body: ApiCallOptions["body"], headers: Headers): BodyInit | undefined {
  if (body === null || body === undefined) {
    return undefined;
  }

  if (
    typeof body === "string" ||
    body instanceof ArrayBuffer ||
    ArrayBuffer.isView(body) ||
    body instanceof URLSearchParams ||
    body instanceof Blob ||
    body instanceof FormData
  ) {
    return body as BodyInit;
  }

  if (body instanceof ReadableStream) {
    return body as BodyInit;
  }

  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  return JSON.stringify(body);
}

export class TechnitiumDnsClient {
  private readonly baseUrl: string;
  private readonly defaultHeaders: HeaderRecord;
  private readonly auth?: TechnitiumConfigAuth;
  private readonly fetchImpl: typeof fetch;
  private readonly requestTimeoutMs: number;
  private sessionToken?: string;
  private tokenSource: SessionTokenSnapshot["source"] = "unknown";

  constructor(options: TechnitiumClientOptions) {
    if (!options.api?.baseUrl) {
      throw new TechnitiumConfigurationError("Technitium API baseUrl is required.");
    }

    this.baseUrl = normalizeBaseUrl(options.api.baseUrl);
    this.auth = options.auth;
    this.fetchImpl = options.fetchImplementation ?? globalThis.fetch.bind(globalThis);
    this.defaultHeaders = {
      Accept: "application/json",
      ...options.api.defaultHeaders,
      ...options.defaultHeaders,
    } satisfies HeaderRecord;
    this.requestTimeoutMs = options.api.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    if (options.auth?.token) {
      this.sessionToken = options.auth.token;
      this.tokenSource = "config";
    }
  }

  public snapshotToken(): SessionTokenSnapshot {
    return { token: this.sessionToken, source: this.tokenSource };
  }

  public setToken(token: string | undefined, source: SessionTokenSnapshot["source"] = "explicit"): void {
    this.sessionToken = token;
    this.tokenSource = source;
  }

  public async login(options: LoginOptions = {}): Promise<LoginResponse> {
    const username = options.username ?? this.auth?.username;
    const password = options.password ?? this.auth?.password;

    if (!username || !password) {
      throw new TechnitiumConfigurationError("Username and password are required for login.");
    }

    const query = {
      user: username,
      pass: password,
      totp: options.totp ?? this.auth?.totp,
      includeInfo: options.includeInfo ? "true" : undefined,
    } as Record<string, string | undefined>;

    const { data } = await this.call<LoginResponse>("user.login", {
      query,
      includeToken: false,
    });

    this.setToken(data.token, "login");
    return data;
  }

  public async logout(token?: string): Promise<void> {
    const sessionToken = token ?? this.sessionToken ?? this.auth?.token;
    if (!sessionToken) {
      throw new TechnitiumConfigurationError("No session token available for logout.");
    }

    await this.call("user.logout", {
      query: { token: sessionToken },
      includeToken: false,
    });

    if (!token) {
      this.setToken(undefined, "explicit");
    }
  }

  public async getSessionInfo(): Promise<SessionInfoResponse> {
    const { data } = await this.call<SessionInfoResponse>("user.session.get");
    return data;
  }

  public async getDashboardStats(query?: QueryParams): Promise<DashboardStatsResponse> {
    const { data } = await this.call<DashboardStatsResponse>("dashboard.stats.get", { query });
    return data;
  }

  public async listZones(query?: QueryParams): Promise<PaginatedZoneList> {
    const { data } = await this.call<PaginatedZoneList>("zones.list", { query });
    return data;
  }

  public async listZoneRecords(query: {
    zone: string;
    domain: string;
    listZone?: boolean;
    node?: string;
  }): Promise<ZoneRecordListResponse> {
    const { data } = await this.call<ZoneRecordListResponse>("zones.records.list", { query });
    return data;
  }

  public async addZoneRecord(query: QueryParams): Promise<void> {
    await this.call("zones.records.add", { query });
  }

  public async updateZoneRecord(query: QueryParams): Promise<void> {
    await this.call("zones.records.update", { query });
  }

  public async deleteZoneRecord(query: QueryParams): Promise<void> {
    await this.call("zones.records.delete", { query });
  }

  public async listCachedZones(query?: QueryParams): Promise<CachedZoneList> {
    const { data } = await this.call<CachedZoneList>("cache.list", { query });
    return data;
  }

  public async flushCache(): Promise<void> {
    await this.call("cache.flush");
  }

  public async deleteCachedZone(domain: string): Promise<void> {
    await this.call("cache.delete", { query: { domain } });
  }

  public async listAllowedZones(query?: QueryParams): Promise<AllowedZoneList> {
    const { data } = await this.call<AllowedZoneList>("allowed.list", { query });
    return data;
  }

  public async allowZone(domain: string): Promise<void> {
    await this.call("allowed.add", { query: { domain } });
  }

  public async deleteAllowedZone(domain: string): Promise<void> {
    await this.call("allowed.delete", { query: { domain } });
  }

  public async listBlockedZones(query?: QueryParams): Promise<BlockedZoneList> {
    const { data } = await this.call<BlockedZoneList>("blocked.list", { query });
    return data;
  }

  public async blockZone(domain: string): Promise<void> {
    await this.call("blocked.add", { query: { domain } });
  }

  public async deleteBlockedZone(domain: string): Promise<void> {
    await this.call("blocked.delete", { query: { domain } });
  }

  public async listLogs(): Promise<LogListResponse> {
    const { data } = await this.call<LogListResponse>("logs.list");
    return data;
  }

  public async resolveDns(query: {
    name: string;
    type: string;
    class?: string;
    resolver?: string;
  }): Promise<DnsResolveResponse> {
    const { data } = await this.call<DnsResolveResponse>("dns.resolve", { query });
    return data;
  }

  public async call<T = unknown>(endpointId: string, options: ApiCallOptions = {}): Promise<ApiCallResult<T>> {
    const endpoint = getEndpointDefinition(endpointId);
    const method = (options.method ?? endpoint.method).toUpperCase();
    const url = this.buildUrl(endpoint, options);

    const headers = new Headers(this.defaultHeaders);
    if (options.headers) {
      for (const [key, value] of Object.entries(options.headers)) {
        headers.set(key, value);
      }
    }

    const body = resolveBody(options.body, headers);
    const timeoutMs = options.timeoutMs ?? this.requestTimeoutMs;
    const controller = new AbortController();
    const timeoutId = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : undefined;

    try {
      const response = await this.fetchImpl(url, {
        method,
        headers,
        body,
        signal: options.signal ?? controller.signal,
      });

      if (!response.ok) {
        throw new TechnitiumHttpError(`Request failed with status ${response.status}`, {
          statusCode: response.status,
          statusText: response.statusText,
          endpointId,
          endpointPath: endpoint.path,
          payload: await safeParseJson(response).catch(() => undefined),
        });
      }

      const parsed = await this.parseResponse(response, options.responseType);
      const statusValue = typeof parsed.status === "string" ? parsed.status : undefined;
      const errorMessage = typeof parsed.errorMessage === "string" ? parsed.errorMessage : undefined;

      if (statusValue && statusValue !== "ok") {
        throw new TechnitiumApiError(errorMessage ?? `Technitium API call failed with status ${statusValue}`, {
          endpointId,
          endpointPath: endpoint.path,
          status: statusValue,
          payload: parsed,
        });
      }

      const data = ("response" in parsed && parsed.response !== undefined ? parsed.response : parsed) as T;
      const status = statusValue ?? "ok";

      return {
        endpoint,
        data,
        status,
        raw: parsed,
        response,
      };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new TechnitiumTimeoutError(`Technitium API request timed out after ${timeoutMs}ms`, {
          endpointId,
          endpointPath: endpoint.path,
          cause: error,
        });
      }
      throw error;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  private buildUrl(endpoint: EndpointDefinition, options: ApiCallOptions): string {
    const url = new URL(endpoint.path.startsWith("/") ? endpoint.path.slice(1) : endpoint.path, this.baseUrl);
    const searchParams = url.searchParams;

    if (endpoint.defaultQuery) {
      for (const [key, value] of Object.entries(endpoint.defaultQuery)) {
        searchParams.set(key, String(value));
      }
    }

    if (options.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value === undefined) {
          continue;
        }

        if (Array.isArray(value)) {
          value
            .filter((entry) => entry !== undefined && entry !== null)
            .forEach((entry) => searchParams.append(key, toQueryStringValue(entry)));
          continue;
        }

        searchParams.set(key, toQueryStringValue(value));
      }
    }

    const shouldIncludeToken = options.includeToken ?? endpoint.requiresToken ?? false;
    if (shouldIncludeToken && !searchParams.has("token")) {
      const token = options.token ?? this.sessionToken ?? this.auth?.token;
      if (!token) {
        throw new TechnitiumConfigurationError(
          "Technitium API token is required but missing. Use login() or setToken().",
          {
            endpointId: endpoint.id,
            endpointPath: endpoint.path,
          },
        );
      }
      searchParams.set("token", token);
    }

    return url.toString();
  }

  private async parseResponse(
    response: Response,
    forcedType?: ApiCallOptions["responseType"],
  ): Promise<Record<string, unknown>> {
    if (forcedType === "text") {
      const text = await response.text();
      return { status: "ok", response: text };
    }

    if (forcedType === "arrayBuffer") {
      const buffer = await response.arrayBuffer();
      return { status: "ok", response: buffer };
    }

    if (forcedType === "stream") {
      return { status: "ok", response: response.body }; // stream consumer decides how to handle
    }

    const contentType = response.headers.get("content-type");
    if (!contentType || !isJsonLike(contentType)) {
      const text = await response.text();
      return { status: "ok", response: text };
    }

    const json = await response.json();
    if (typeof json !== "object" || json === null) {
      return { status: "ok", response: json } satisfies Record<string, unknown>;
    }

    return json as Record<string, unknown>;
  }
}

export function createTechnitiumClient(options: TechnitiumClientOptions): TechnitiumDnsClient {
  return new TechnitiumDnsClient(options);
}

async function safeParseJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type");
  if (!contentType || !isJsonLike(contentType)) {
    return undefined;
  }

  try {
    return await response.clone().json();
  } catch (error) {
    return {
      error: "Failed to parse error response as JSON",
      cause: error instanceof Error ? error.message : String(error),
    };
  }
}
