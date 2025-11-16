import * as os from "os";
import * as path from "path";
import { chmod } from "fs/promises";

// Download and install task
export async function downloadAndInstallTask(): Promise<boolean> {
  // Construct URL and binary path
  const url = "https://taskfile.dev/install.sh";
  const tmpDir = process.env.TEMP || process.env.TEMP_DIR || os.tmpdir();
  const binPath = path.join(tmpDir, `task.sh`);

  logger.info(`Downloading Task from ${url}...`);

  try {
    // Download the binary
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Download failed: ${response.status} ${response.statusText}`);
    }

    // Write the file
    const fileData = await response.arrayBuffer();
    await Bun.write(binPath, fileData);
    await chmod(binPath, 0o700);

    const shellOutput = await $`sh -c ${binPath} -- -d`.quiet();
    return shellOutput.exitCode === 0;
  } catch (error) {
    // @ts-expect-error object is unknown
    logger.error(`Failed to install Task: ${error.message}`);
    throw error;
  }
}
