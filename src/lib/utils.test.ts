import { expect, test, beforeEach, afterEach } from "bun:test";
import { has, pathAdd, envAdd } from "@/lib";

// Store original environment variables to restore after tests
let originalEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  // Save original environment
  originalEnv = { ...process.env };
});

afterEach(() => {
  // Restore original environment
  process.env = { ...originalEnv };
});

test("works with real commands", async () => {
  // Using actual commands that should exist on most systems
  expect(await has("ls")).toBe(true);
  expect(await has("echo")).toBe(true);

  // This command likely doesn't exist
  expect(await has("command-that-does-not-exist-123")).toBe(false);
});

// Tests for pathAdd function
test("pathAdd() adds paths to an environment variable", () => {
  // Test with non-existing variable
  const testVar = "TEST_PATH_VAR";
  delete process.env[testVar]; // Ensure variable doesn't exist

  // Add a single path
  const result1 = pathAdd(testVar, "/usr/local/test");
  expect(process.env[testVar]).toBe("/usr/local/test");
  expect(result1).toBe("/usr/local/test");

  // Add another path (should prepend)
  const result2 = pathAdd(testVar, "/opt/test");
  expect(process.env[testVar]).toBe("/opt/test:/usr/local/test");
  expect(result2).toBe("/opt/test:/usr/local/test");

  // Add multiple paths (should prepend in reverse order)
  const result3 = pathAdd(testVar, "/bin/test", "/sbin/test");
  expect(process.env[testVar]).toBe("/sbin/test:/bin/test:/opt/test:/usr/local/test");
  expect(result3).toBe("/sbin/test:/bin/test:/opt/test:/usr/local/test");
});

test("pathAdd() handles tilde expansion", () => {
  const testVar = "TILDE_TEST_VAR";
  delete process.env[testVar]; // Ensure variable doesn't exist

  // Store original HOME value
  process.env.HOME = "/home/testuser";

  // Add path with tilde
  const result = pathAdd(testVar, "~/bin", "/usr/bin");
  expect(process.env[testVar]).toBe("/usr/bin:/home/testuser/bin");
  expect(result).toBe("/usr/bin:/home/testuser/bin");
});

// Tests for envAdd function (alias of pathAdd)
test("envAdd() adds paths to the PATH variable", () => {
  // Set a clean known PATH
  process.env.PATH = "/usr/bin:/bin";

  // Add a single path
  const result1 = envAdd("./node_modules/.bin");
  expect(process.env.PATH).toBe("./node_modules/.bin:/usr/bin:/bin");
  expect(result1).toBe("./node_modules/.bin:/usr/bin:/bin");

  // Add multiple paths
  const result2 = envAdd("./scripts", "./bin");
  expect(process.env.PATH).toBe("./bin:./scripts:./node_modules/.bin:/usr/bin:/bin");
  expect(result2).toBe("./bin:./scripts:./node_modules/.bin:/usr/bin:/bin");
});

test("envAdd() handles tilde expansion", () => {
  // Set clean known values
  process.env.PATH = "/usr/bin:/bin";
  process.env.HOME = "/home/testuser";

  // Add path with tilde
  const result = envAdd("~/.local/bin");
  expect(process.env.PATH).toBe("/home/testuser/.local/bin:/usr/bin:/bin");
  expect(result).toBe("/home/testuser/.local/bin:/usr/bin:/bin");
});
