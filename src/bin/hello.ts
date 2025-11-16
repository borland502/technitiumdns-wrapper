import { has, pathAdd } from "@/lib";

export async function hello(): Promise<void> {
  // Using various log levels from the global logger
  logger.info("Hello world from info level!");
  logger.warn("This is a warning message");
  logger.error("This is an error message");
  logger.debug("This is a debug message (may not show with current log level)");

  if (await has("ls")) {
    logger.info("The 'ls' command is available on this system.");
  } else {
    logger.warn("The 'ls' command is not available on this system.");
  }

  if (await has("brew")) {
    logger.info("The 'brew' command is available on this system.");
  } else {
    logger.warn("The 'brew' command is not available on this system.");
  }

  await pathAdd("PATH", "~/.local/bin", "~/bin");

  logger.info(`Path variable: ${process.env.PATH}`);
}
