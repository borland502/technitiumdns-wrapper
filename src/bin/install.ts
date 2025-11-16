import { type AppConfig } from "@/types/config";
import { logger } from "@/lib/logger";
import { join } from "path";

/**
 * Creates a set of installation scripts based on application configuration
 *
 * @param appConfig The application configuration
 * @returns A set of Script objects for various installation tasks
 */
export function createInstallationScripts(appConfig: AppConfig): Set<Script> {
  for (const script of appConfig.scripts) {
    if (script.name === "install-task") {
      script.command = join(appConfig.bin, script.command);
      script.description = `Install ${appConfig.name} task`;
      script.args = [appConfig.name];
      script.env = { ...process.env };
      script.output = "inherit";
    }
  }
  return new Set(appConfig.scripts);
}

/**
 * Downloads and installs Task using the predefined script
 */
export async function downloadAndInstallTask(): Promise<void> {
  const taskScript = Array.from(
    createInstallationScripts({
      name: "bun-sea",
      version: "0.1.2",
      description: "A CLI template for bootstrapping Bun applications",
    }),
  ).find((script) => script.name === "install-task");

  if (!taskScript) {
    throw new Error("Task installation script not found");
  }

  logger.info(`Starting: ${taskScript.description}`);

  try {
    const proc = Bun.spawn({
      cmd: [taskScript.command, ...(taskScript.args || [])],
      env: taskScript.env,
      stdout: taskScript.output === "inherit" ? "inherit" : "pipe",
      stderr: taskScript.output === "inherit" ? "inherit" : "pipe",
    });

    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      throw new Error(`Task installation failed with exit code ${exitCode}`);
    }

    logger.info("Task installed successfully");
  } catch (error) {
    if (error instanceof Error) {
      logger.error(`Installation error: ${error.message}`);
    } else {
      logger.error(`Installation error: ${String(error)}`);
    }
    throw error;
  }
}
