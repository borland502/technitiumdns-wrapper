import "@/globals";

import { downloadAndInstallTask } from "@/bin/install";
import { Command } from "commander";
import { hello } from "@/index";
import { has } from "./lib";
import { appConfig } from "./lib/config";

export const program = new Command();

// Use configuration values for program metadata
program.name(appConfig.app.name).description(appConfig.app.description).version(appConfig.app.version);

// Dynamically register commands based on configuration
appConfig.commands.forEach((cmd) => {
  if (cmd.subcommands) {
    // Handle command with subcommands
    const parentCommand = program.command(cmd.name).description(cmd.description);

    cmd.children?.forEach((subCmd) => {
      const command = parentCommand.command(subCmd.name).description(subCmd.description);

      if (subCmd.name === "task") {
        command.action(async () => {
          try {
            if (await has("task")) {
              logger.info("Task is already installed");
              return;
            }

            await downloadAndInstallTask();
            logger.info("Task installation complete");
          } catch (error) {
            if (error instanceof Error) {
              logger.error(`Error: ${error.message}`);
            } else {
              logger.error(`Error: ${String(error)}`);
            }
            process.exit(1);
          }
        });
      }
    });
  } else {
    // Handle simple commands
    if (cmd.name === "hello") {
      program
        .command(cmd.name)
        .description(cmd.description)
        .action(async () => {
          await hello();
        });
    }
  }
});

program.parse(process.argv);
