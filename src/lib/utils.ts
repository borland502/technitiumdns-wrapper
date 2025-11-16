import { join } from "path";
import { logger } from "@/lib/logger";

/**
 * Checks if a command exists in the PATH
 */
export async function has(command: string): Promise<boolean> {
  try {
    const proc = Bun.spawn({
      cmd: ["which", command],
      stdout: "pipe",
    });

    const exitCode = await proc.exited;
    logger.debug(`Command "${command}" has result with exit code ${exitCode}.`);
    return exitCode === 0;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (_error) {
    logger.debug(`Command "${command}" not found in PATH.`);
    return false;
  }
}

/**
 * Adds one or more paths to the specified environment variable
 * If no variable is specified, uses PATH
 * Paths are prepended in the order specified
 */
export function pathAdd(varName: string = "PATH", ...paths: string[]): string {
  // If first arg is not a valid environment variable name, treat it as a path
  if (varName.includes("/") || varName.includes("~") || varName.startsWith(".")) {
    paths = [varName, ...paths];
    varName = "PATH";
  }

  const currentValue = process.env[varName] || "";
  logger.debug(`Adding to ${varName}, current value: ${currentValue}`);

  // Process paths in reverse order so they end up in the specified order
  const processedPaths: string[] = [];
  for (const path of paths.reverse()) {
    // Handle tilde expansion
    const expandedPath = path.startsWith("~/") ? join(process.env.HOME || "~", path.slice(2)) : path;
    processedPaths.push(expandedPath);
  }

  logger.debug(`Adding paths: ${processedPaths.join(", ")}`);

  // Build the new value with paths prepended
  const newValue = [...processedPaths, currentValue].filter(Boolean).join(":");
  process.env[varName] = newValue;

  logger.debug(`Updated ${varName} to: ${newValue}`);
  return newValue;
}

// Alias for pathAdd to keep compatibility with both naming conventions
export const envAdd = pathAdd;
