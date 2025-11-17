import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import TOML, { type JsonMap } from "@iarna/toml";
import { logger } from "@/lib/logger";
import type { Config, AppConfig, ApiConfig, AuthConfig, CliConfig } from "@/types/config";

type ConfigPatch = {
  app?: Partial<AppConfig>;
  api?: Partial<ApiConfig>;
  auth?: Partial<AuthConfig>;
  cli?: Partial<CliConfig>;
};

const fallbackConfig: Config = {
  app: {
    name: "technitiumdns-cli",
    version: "0.2.1",
    description: "Interact with Technitium DNS Server over its HTTP API",
  },
  api: {
    baseUrl: "http://localhost:5380/api",
    timeoutMs: 15000,
    verifyTls: true,
  },
  auth: {
    username: "admin",
    password: "change-me",
    token: "",
    totp: "",
  },
  cli: {
    defaultOutputFormat: "json",
    prettyPrintJson: true,
    colorizeJson: true,
  },
};

const embeddedDefaultToml = serializeConfig(fallbackConfig);

const projectName = sanitizeProjectName(process.env.PROJECT_NAME) ?? fallbackConfig.app.name;
const userConfigDirectory = path.join(resolveConfigHome(process.env.XDG_CONFIG_HOME), projectName);
const userConfigPath = path.join(userConfigDirectory, "config.toml");

let userConfigCache: ConfigPatch | null = null;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizePatch(source: JsonMap | ConfigPatch | null | undefined): ConfigPatch {
  if (!source || !isPlainObject(source)) {
    return {};
  }

  const record = source as Record<string, unknown>;
  const patch: ConfigPatch = {};

  if (isPlainObject(record.app)) {
    patch.app = record.app as Partial<AppConfig>;
  }
  if (isPlainObject(record.api)) {
    patch.api = record.api as Partial<ApiConfig>;
  }
  if (isPlainObject(record.auth)) {
    patch.auth = record.auth as Partial<AuthConfig>;
  }
  if (isPlainObject(record.cli)) {
    patch.cli = record.cli as Partial<CliConfig>;
  }

  return patch;
}

function sanitizeProjectName(value?: string | null): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.replace(/[\\/]/g, "-");
}

function resolveConfigHome(value?: string | null): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return path.join(os.homedir(), ".config");
  }

  const expanded = trimmed.startsWith("~") ? path.join(os.homedir(), trimmed.slice(1)) : trimmed;

  if (path.isAbsolute(expanded)) {
    return expanded;
  }

  return path.join(os.homedir(), ".config");
}

function ensureUserConfigExists(): void {
  try {
    if (!fs.existsSync(userConfigDirectory)) {
      fs.mkdirSync(userConfigDirectory, { recursive: true, mode: 0o700 });
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    logger.warn(`Failed to create configuration directory ${userConfigDirectory}: ${reason}`);
  }

  if (fs.existsSync(userConfigPath)) {
    return;
  }

  try {
    fs.writeFileSync(userConfigPath, embeddedDefaultToml, { encoding: "utf8", mode: 0o600 });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    logger.warn(`Failed to create default configuration at ${userConfigPath}: ${reason}`);
  }
}

function loadUserConfig(): ConfigPatch {
  if (userConfigCache) {
    return userConfigCache;
  }

  ensureUserConfigExists();

  try {
    const raw = fs.readFileSync(userConfigPath, "utf8");
    const parsed = TOML.parse(raw) as JsonMap;
    userConfigCache = normalizePatch(parsed);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    logger.warn(`Failed to load configuration overrides from ${userConfigPath}: ${reason}`);
    userConfigCache = {};
  }

  if (!userConfigCache) {
    userConfigCache = {};
  }

  return userConfigCache;
}

const ENV_PREFIX = "TECHNITIUMDNS_CLI_";

const ENV_KEY_MAP: Record<keyof Config, Record<string, string>> = {
  app: {
    NAME: "name",
    VERSION: "version",
    DESCRIPTION: "description",
  },
  api: {
    BASEURL: "baseUrl",
    TIMEOUTMS: "timeoutMs",
    VERIFYTLS: "verifyTls",
  },
  auth: {
    USERNAME: "username",
    PASSWORD: "password",
    TOKEN: "token",
    TOTP: "totp",
  },
  cli: {
    DEFAULTOUTPUTFORMAT: "defaultOutputFormat",
    PRETTYPRINTJSON: "prettyPrintJson",
    COLORIZEJSON: "colorizeJson",
  },
};

function loadEnvOverrides(): ConfigPatch {
  const appOverrides: Partial<AppConfig> = {};
  const apiOverrides: Partial<ApiConfig> = {};
  const authOverrides: Partial<AuthConfig> = {};
  const cliOverrides: Partial<CliConfig> = {};

  for (const [rawKey, rawValue] of Object.entries(process.env)) {
    if (!rawKey.startsWith(ENV_PREFIX) || rawValue === undefined) {
      continue;
    }

    const [sectionKeyRaw, propertyKeyRaw] = rawKey.slice(ENV_PREFIX.length).split("__");
    if (!sectionKeyRaw || !propertyKeyRaw) {
      continue;
    }

    const sectionKey = sectionKeyRaw.toLowerCase() as keyof Config;
    const propertyMap = ENV_KEY_MAP[sectionKey];
    if (!propertyMap) {
      continue;
    }

    const propertyKey = propertyMap[propertyKeyRaw.toUpperCase()];
    if (!propertyKey) {
      continue;
    }

    const parsed = parseEnvValue(sectionKey, propertyKey, rawValue);

    switch (sectionKey) {
      case "app": {
        (appOverrides as unknown as Record<string, unknown>)[propertyKey] = parsed;
        break;
      }
      case "api": {
        (apiOverrides as unknown as Record<string, unknown>)[propertyKey] = parsed;
        break;
      }
      case "auth": {
        (authOverrides as unknown as Record<string, unknown>)[propertyKey] = parsed;
        break;
      }
      case "cli": {
        (cliOverrides as unknown as Record<string, unknown>)[propertyKey] = parsed;
        break;
      }
      default:
        break;
    }
  }

  const overrides: ConfigPatch = {};
  if (Object.keys(appOverrides).length > 0) {
    overrides.app = appOverrides;
  }
  if (Object.keys(apiOverrides).length > 0) {
    overrides.api = apiOverrides;
  }
  if (Object.keys(authOverrides).length > 0) {
    overrides.auth = authOverrides;
  }
  if (Object.keys(cliOverrides).length > 0) {
    overrides.cli = cliOverrides;
  }

  return overrides;
}

function parseEnvValue(section: keyof Config, property: string, raw: string): unknown {
  const baseSection = fallbackConfig[section] as unknown as Record<string, unknown>;
  const baseline = baseSection?.[property];

  if (typeof baseline === "number") {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : baseline;
  }

  if (typeof baseline === "boolean") {
    const normalized = raw.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no", "off"].includes(normalized)) {
      return false;
    }
    return baseline;
  }

  return raw;
}

function mergeSection<T extends object>(base: T, overlay?: Partial<T>): T {
  const result = { ...base } as T;
  if (!overlay) {
    return result;
  }

  for (const key of Object.keys(overlay) as Array<keyof T>) {
    const value = overlay[key];
    if (value !== undefined) {
      result[key] = value as T[typeof key];
    }
  }

  return result;
}

function cloneConfig(config: Config): Config {
  return {
    app: { ...config.app },
    api: { ...config.api },
    auth: { ...config.auth },
    cli: { ...config.cli },
  } satisfies Config;
}

function mergeConfig(base: Config, ...overlays: Array<ConfigPatch | undefined>): Config {
  let result = cloneConfig(base);
  for (const overlay of overlays) {
    if (!overlay) {
      continue;
    }
    result = {
      app: mergeSection(result.app, overlay.app),
      api: mergeSection(result.api, overlay.api),
      auth: mergeSection(result.auth, overlay.auth),
      cli: mergeSection(result.cli, overlay.cli),
    } satisfies Config;
  }
  return result;
}

function stripUndefined<T extends object>(section: T): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(section) as Array<keyof T>) {
    const value = section[key];
    if (value !== undefined) {
      result[String(key)] = value as unknown;
    }
  }
  return result;
}

function serializeConfig(config: Config): string {
  const payload: JsonMap = {
    app: stripUndefined(config.app) as JsonMap,
    api: stripUndefined(config.api) as JsonMap,
    auth: stripUndefined(config.auth) as JsonMap,
    cli: stripUndefined(config.cli) as JsonMap,
  };
  const serialized = TOML.stringify(payload);
  return serialized.replace(/(\d)_(?=\d)/g, "$1");
}

function writeUserConfig(config: Config): void {
  ensureUserConfigExists();
  const serialized = serializeConfig(config);
  fs.writeFileSync(userConfigPath, serialized, { encoding: "utf8", mode: 0o600 });
  userConfigCache = cloneConfig(config);
}

export function loadConfig(): Config {
  try {
    const overrides = loadUserConfig();
    const envOverrides = loadEnvOverrides();
    return mergeConfig(fallbackConfig, overrides, envOverrides);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    logger.error(`Failed to load configuration: ${reason}`);
    return fallbackConfig;
  }
}

export function updateStoredAuthToken(token: string | undefined): boolean {
  try {
    const current = mergeConfig(fallbackConfig, loadUserConfig());
    current.auth.token = token ?? "";
    writeUserConfig(current);
    return true;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    logger.warn(`Failed to persist authentication token to ${userConfigPath}: ${reason}`);
    return false;
  }
}

export const projectConfigDir = userConfigDirectory;
export const projectConfigFile = userConfigPath;
export const appConfig = loadConfig();
