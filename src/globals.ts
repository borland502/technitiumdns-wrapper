import * as globals from "@/index";
import { logger } from "@/lib/logger";

Object.assign(globalThis, {
  ...globals,
  logger,
});

declare global {
  const $: typeof globals.$;
  const logger: typeof import("@/lib/logger").logger;
}
