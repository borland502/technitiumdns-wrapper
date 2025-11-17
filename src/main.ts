import "@/globals";

import { Command } from "commander";
import { appConfig, projectConfigFile, updateStoredAuthToken } from "./lib/config";
import { logger } from "@/lib/logger";
import { createTechnitiumClient, getEndpointDefinition, listEndpointIds, type QueryParams } from "@/api";

const program = new Command();
const client = createTechnitiumClient({ api: appConfig.api, auth: appConfig.auth });

function writeLine(text: string): void {
  process.stdout.write(`${text}\n`);
}

function collectKeyValue(
  value: string,
  accumulator: Record<string, string | string[]> = {},
): Record<string, string | string[]> {
  const equalsIndex = value.indexOf("=");
  const key = equalsIndex >= 0 ? value.slice(0, equalsIndex) : value;
  const raw = equalsIndex >= 0 ? value.slice(equalsIndex + 1) : "true";

  const existing = accumulator[key];
  if (existing === undefined) {
    accumulator[key] = raw;
  } else if (Array.isArray(existing)) {
    existing.push(raw);
  } else {
    accumulator[key] = [existing, raw];
  }

  return accumulator;
}

function parsePrimitive(value: string): string | number | boolean {
  const trimmed = value.trim();
  if (trimmed === "true") {
    return true;
  }
  if (trimmed === "false") {
    return false;
  }
  const asNumber = Number(trimmed);
  if (!Number.isNaN(asNumber) && trimmed !== "") {
    return asNumber;
  }
  return value;
}

function buildQueryParams(source?: Record<string, string | string[]>): QueryParams | undefined {
  if (!source || Object.keys(source).length === 0) {
    return undefined;
  }

  const query: QueryParams = {};
  for (const [key, value] of Object.entries(source)) {
    if (Array.isArray(value)) {
      query[key] = value.map(parsePrimitive);
      continue;
    }
    query[key] = parsePrimitive(value);
  }
  return query;
}

function buildHeaders(source?: Record<string, string | string[]>): Record<string, string> | undefined {
  if (!source) {
    return undefined;
  }

  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (Array.isArray(value)) {
      headers[key] = value[value.length - 1] ?? "";
      continue;
    }
    headers[key] = value;
  }
  return Object.keys(headers).length > 0 ? headers : undefined;
}

function printResult(result: unknown): void {
  if (result === undefined) {
    logger.info("Done");
    return;
  }

  if (typeof result === "string") {
    writeLine(result);
    return;
  }

  const indent = appConfig.cli.prettyPrintJson === false ? 0 : 2;
  writeLine(JSON.stringify(result, null, indent));
}

program.name(appConfig.app.name).description(appConfig.app.description).version(appConfig.app.version);

const auth = program.command("auth").description("Authentication helpers");

auth
  .command("login")
  .description("Authenticate using configured credentials and print the token")
  .option("-u, --username <username>", "Override configured username")
  .option("-p, --password <password>", "Override configured password")
  .option("--totp <code>", "Provide a TOTP code if 2FA is enabled")
  .option("--include-info", "Include server info in the response")
  .action(async (options) => {
    const response = await client.login({
      username: options.username,
      password: options.password,
      totp: options.totp,
      includeInfo: Boolean(options.includeInfo),
    });
    if (updateStoredAuthToken(response.token)) {
      appConfig.auth.token = response.token;
      logger.info(`Saved token to ${projectConfigFile}`);
    }
    printResult(response);
  });

auth
  .command("logout")
  .description("Logout the current or specified session token")
  .option("--token <token>", "Token to invalidate")
  .action(async (options) => {
    await client.logout(options.token);
    logger.info("Logged out successfully");
  });

auth
  .command("session")
  .description("Display information about the active session")
  .option("--token <token>", "Token to inspect instead of the stored one")
  .action(async (options) => {
    if (options.token) {
      client.setToken(options.token, "explicit");
    }
    const info = await client.getSessionInfo();
    printResult(info);
  });

auth
  .command("set-token <token>")
  .description("Override the session token for subsequent calls")
  .action((token) => {
    client.setToken(token, "explicit");
    logger.info("Session token updated");
  });

const zones = program.command("zones").description("Manage DNS zones and records");

zones
  .command("list")
  .description("List authoritative zones")
  .option("--page <number>", "Page number", Number)
  .option("--per-page <number>", "Zones per page", Number)
  .option("--filter <pattern>", "Filter zones by name")
  .option("--type <type>", "Filter by zone type")
  .option("--node <node>", "Cluster node name")
  .action(async (options) => {
    const query: QueryParams = {};
    if (Number.isFinite(options.page)) {
      query.pageNumber = options.page;
    }
    if (Number.isFinite(options.perPage)) {
      query.zonesPerPage = options.perPage;
    }
    if (options.filter) {
      query.filter = options.filter;
    }
    if (options.type) {
      query.type = options.type;
    }
    if (options.node) {
      query.node = options.node;
    }

    const zonesResponse = await client.listZones(query);
    printResult(zonesResponse);
  });

const records = zones.command("records").description("Manage zone records");

records
  .command("list")
  .description("List DNS records for a domain")
  .requiredOption("--zone <zone>", "Zone name")
  .requiredOption("--domain <domain>", "Domain name")
  .option("--list-zone", "List all records in the zone")
  .option("--node <node>", "Cluster node name")
  .action(async (options) => {
    const payload: {
      zone: string;
      domain: string;
      listZone?: boolean;
      node?: string;
    } = {
      zone: options.zone,
      domain: options.domain,
    };

    if (options.listZone) {
      payload.listZone = true;
    }

    if (options.node) {
      payload.node = options.node;
    }

    const response = await client.listZoneRecords(payload);
    printResult(response);
  });

records
  .command("add")
  .description("Add a DNS record to a zone")
  .requiredOption("--zone <zone>", "Zone name")
  .requiredOption("--domain <domain>", "Domain name")
  .requiredOption("--type <type>", "Record type")
  .option("--value <value>", "Record value")
  .option("--ttl <seconds>", "Time to live", Number)
  .option("--ip-address <ip>", "IP address value")
  .option("--priority <priority>", "Record priority", Number)
  .option("--weight <weight>", "Record weight", Number)
  .option("--port <port>", "Record port", Number)
  .option("--target <target>", "Target hostname")
  .action(async (options) => {
    const query: QueryParams = {
      zone: options.zone,
      domain: options.domain,
      type: options.type,
    };
    if (options.value) query.value = options.value;
    if (Number.isFinite(options.ttl)) query.ttl = options.ttl;
    if (options.ipAddress) query.ipAddress = options.ipAddress;
    if (Number.isFinite(options.priority)) query.priority = options.priority;
    if (Number.isFinite(options.weight)) query.weight = options.weight;
    if (Number.isFinite(options.port)) query.port = options.port;
    if (options.target) query.target = options.target;

    await client.addZoneRecord(query);
    logger.info("Record added");
  });

records
  .command("update")
  .description("Update an existing DNS record")
  .requiredOption("--zone <zone>", "Zone name")
  .requiredOption("--domain <domain>", "Domain name")
  .requiredOption("--type <type>", "Record type")
  .option("--value <value>", "Current record value")
  .option("--ip-address <ip>", "Current IP address")
  .option("--new-value <value>", "Replacement value")
  .option("--new-ip-address <ip>", "Replacement IP address")
  .option("--ttl <seconds>", "Updated TTL", Number)
  .action(async (options) => {
    const query: QueryParams = {
      zone: options.zone,
      domain: options.domain,
      type: options.type,
    };
    if (options.value) query.value = options.value;
    if (options.ipAddress) query.ipAddress = options.ipAddress;
    if (options.newValue) query.newValue = options.newValue;
    if (options.newIpAddress) query.newIpAddress = options.newIpAddress;
    if (Number.isFinite(options.ttl)) query.ttl = options.ttl;

    await client.updateZoneRecord(query);
    logger.info("Record updated");
  });

records
  .command("delete")
  .description("Delete a DNS record from a zone")
  .requiredOption("--zone <zone>", "Zone name")
  .requiredOption("--domain <domain>", "Domain name")
  .requiredOption("--type <type>", "Record type")
  .option("--value <value>", "Record value")
  .option("--ip-address <ip>", "Record IP")
  .option("--priority <priority>", "Record priority", Number)
  .option("--weight <weight>", "Record weight", Number)
  .option("--port <port>", "Record port", Number)
  .option("--target <target>", "Target host")
  .action(async (options) => {
    const query: QueryParams = {
      zone: options.zone,
      domain: options.domain,
      type: options.type,
    };
    if (options.value) query.value = options.value;
    if (options.ipAddress) query.ipAddress = options.ipAddress;
    if (Number.isFinite(options.priority)) query.priority = options.priority;
    if (Number.isFinite(options.weight)) query.weight = options.weight;
    if (Number.isFinite(options.port)) query.port = options.port;
    if (options.target) query.target = options.target;

    await client.deleteZoneRecord(query);
    logger.info("Record deleted");
  });

const cache = program.command("cache").description("Inspect DNS cache");

cache
  .command("list")
  .description("List cached zones or records")
  .option("--domain <domain>", "Domain to inspect")
  .option("--direction <direction>", "Traversal direction (up|down)")
  .option("--node <node>", "Cluster node name")
  .action(async (options) => {
    const query: QueryParams = {};
    if (options.domain) query.domain = options.domain;
    if (options.direction) query.direction = options.direction;
    if (options.node) query.node = options.node;

    const response = await client.listCachedZones(Object.keys(query).length ? query : undefined);
    printResult(response);
  });

cache
  .command("flush")
  .description("Flush the DNS cache")
  .action(async () => {
    await client.flushCache();
    logger.info("Cache flushed");
  });

cache
  .command("delete <domain>")
  .description("Delete cached entries for a domain")
  .action(async (domain) => {
    await client.deleteCachedZone(domain);
    logger.info(`Deleted cache for ${domain}`);
  });

const allowed = program.command("allowed").description("Manage allowed zones");

allowed
  .command("list")
  .description("List allowed zones")
  .option("--domain <domain>", "Domain filter")
  .option("--direction <direction>", "Traversal direction")
  .option("--node <node>", "Cluster node")
  .action(async (options) => {
    const query: QueryParams = {};
    if (options.domain) query.domain = options.domain;
    if (options.direction) query.direction = options.direction;
    if (options.node) query.node = options.node;

    const response = await client.listAllowedZones(Object.keys(query).length ? query : undefined);
    printResult(response);
  });

allowed
  .command("add <domain>")
  .description("Allow a domain")
  .action(async (domain) => {
    await client.allowZone(domain);
    logger.info(`Allowed zone ${domain}`);
  });

allowed
  .command("delete <domain>")
  .description("Remove a domain from the allowed list")
  .action(async (domain) => {
    await client.deleteAllowedZone(domain);
    logger.info(`Removed allowed zone ${domain}`);
  });

const blocked = program.command("blocked").description("Manage blocked zones");

blocked
  .command("list")
  .description("List blocked zones")
  .option("--domain <domain>", "Domain filter")
  .option("--direction <direction>", "Traversal direction")
  .option("--node <node>", "Cluster node")
  .action(async (options) => {
    const query: QueryParams = {};
    if (options.domain) query.domain = options.domain;
    if (options.direction) query.direction = options.direction;
    if (options.node) query.node = options.node;

    const response = await client.listBlockedZones(Object.keys(query).length ? query : undefined);
    printResult(response);
  });

blocked
  .command("add <domain>")
  .description("Block a domain")
  .action(async (domain) => {
    await client.blockZone(domain);
    logger.info(`Blocked zone ${domain}`);
  });

blocked
  .command("delete <domain>")
  .description("Remove a domain from the blocked list")
  .action(async (domain) => {
    await client.deleteBlockedZone(domain);
    logger.info(`Removed blocked zone ${domain}`);
  });

const dashboard = program.command("dashboard").description("Inspect dashboard metrics");

dashboard
  .command("stats")
  .description("Fetch dashboard statistics")
  .option("--node <node>", "Cluster node name")
  .action(async (options) => {
    const query: QueryParams = {};
    if (options.node) query.node = options.node;

    const stats = await client.getDashboardStats(Object.keys(query).length ? query : undefined);
    printResult(stats);
  });

const logs = program.command("logs").description("Inspect server logs");

logs
  .command("list")
  .description("List available log files")
  .action(async () => {
    const response = await client.listLogs();
    printResult(response);
  });

const dns = program.command("dns").description("DNS client helpers");

dns
  .command("resolve <name>")
  .description("Resolve a domain using the server resolver")
  .option("--type <type>", "Record type", "A")
  .option("--class <class>", "DNS class")
  .option("--resolver <id>", "Resolver identifier")
  .action(async (name, options) => {
    const response = await client.resolveDns({
      name,
      type: options.type,
      class: options.class,
      resolver: options.resolver,
    });
    printResult(response);
  });

program
  .command("call <endpointId>")
  .description("Invoke a Technitium API endpoint by its identifier")
  .option("-q, --query <key=value>", "Query parameter", collectKeyValue, {})
  .option("-H, --header <key=value>", "Additional request header", collectKeyValue, {})
  .option("-X, --method <method>", "HTTP method override")
  .option("--body <json>", "JSON payload for the request body")
  .option("--token <token>", "Token override for this call")
  .option("--response-type <type>", "Response type (json|text|arrayBuffer|stream)")
  .option("--auth <mode>", "Token handling mode: auto|on|off", "auto")
  .action(async (endpointId, options) => {
    const knownEndpoints = new Set(listEndpointIds());
    let endpoint;
    try {
      endpoint = getEndpointDefinition(endpointId);
    } catch (error) {
      logger.error(`Unknown endpoint id: ${endpointId}`);
      logger.info(`Known endpoints: ${Array.from(knownEndpoints).join(", ")}`);
      if (error instanceof Error) {
        logger.debug(error.stack ?? error.message);
      }
      process.exitCode = 1;
      return;
    }
    const query = buildQueryParams(options.query as Record<string, string | string[]>);
    const headers = buildHeaders(options.header as Record<string, string | string[]>);
    let body: unknown;
    if (options.body) {
      try {
        body = JSON.parse(options.body);
      } catch (error) {
        throw new Error(`Failed to parse body as JSON: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const authMode = typeof options.auth === "string" ? options.auth.toLowerCase() : "auto";
    let includeToken: boolean | undefined;
    if (authMode === "on") {
      includeToken = true;
    } else if (authMode === "off") {
      includeToken = false;
    } else if (authMode !== "auto") {
      logger.warn("Invalid auth mode. Expected one of: auto, on, off. Falling back to auto.");
    }

    const result = await client.call(endpoint.id, {
      method: options.method,
      query,
      headers,
      body: body as Record<string, unknown> | undefined,
      token: options.token,
      includeToken,
      responseType: options.responseType,
    });

    printResult(result.data);
  });

program
  .command("endpoints")
  .description("List known API endpoint identifiers")
  .action(() => {
    const ids = Array.from(listEndpointIds()).sort();
    if (ids.length === 0) {
      logger.warn("No endpoints registered in the catalog");
      return;
    }
    ids.forEach((id) => writeLine(id));
  });

process.on("unhandledRejection", (reason) => {
  logger.error(`Unhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}`);
  process.exit(1);
});

void program.parseAsync(process.argv);
