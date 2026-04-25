const { test, describe } = require("node:test");
const assert = require("node:assert");
const { execSync } = require("node:child_process");
const path = require("node:path");

const BIN_PATH = path.join(__dirname, "../bin/rebase-stack.js");

function runCLI(args = []) {
  const cmd = `node ${BIN_PATH} ${args.join(" ")}`;
  try {
    const output = execSync(cmd, { encoding: "utf-8", stdio: "pipe" });
    return { success: true, output, error: null };
  } catch (error) {
    return {
      success: false,
      output: error.stdout || "",
      error: error.stderr || error.stdout || error.message,
    };
  }
}

describe("rebase-stack CLI Tests", () => {
  test("should display help with --help flag", () => {
    const result = runCLI(["--help"]);
    assert.strictEqual(result.success, true);
    assert.match(result.output, /Rebase Stack/);
    assert.match(result.output, /Usage:/);
    assert.match(result.output, /Options:/);
  });

  test("should display help with -h flag", () => {
    const result = runCLI(["-h"]);
    assert.strictEqual(result.success, true);
    assert.match(result.output, /Rebase Stack/);
  });

  test("should display version with --version flag", () => {
    const result = runCLI(["--version"]);
    assert.strictEqual(result.success, true);
    assert.match(result.output, /rebase-stack v\d+\.\d+\.\d+/);
  });

  test("should display version with -v flag", () => {
    const result = runCLI(["-v"]);
    assert.strictEqual(result.success, true);
    assert.match(result.output, /rebase-stack v\d+\.\d+\.\d+/);
  });

  test("should mention auto-discovery and explicit mode in help", () => {
    const result = runCLI(["--help"]);
    assert.strictEqual(result.success, true);
    assert.match(result.output, /Auto-discovery/);
    assert.match(result.output, /Explicit mode/);
    assert.match(result.output, /--host/);
  });

  test("with no args attempts auto-discovery (needs gh CLI)", () => {
    const result = runCLI([]);
    // Should attempt discovery, not fail with "2 arguments required"
    assert.doesNotMatch(
      result.output + (result.error || ""),
      /At least 2 arguments required/
    );
  });

  test("with 1 arg attempts auto-discovery for that branch", () => {
    const result = runCLI(["some-feature-branch"]);
    // Should attempt discovery, not fail with "2 arguments required"
    assert.doesNotMatch(
      result.output + (result.error || ""),
      /At least 2 arguments required/
    );
  });
});

describe("rebase-stack Explicit Mode", () => {
  test("should accept --dry-run flag", () => {
    const result = runCLI(["main", "feature-a", "--dry-run"]);
    if (result.success) {
      assert.match(result.output, /Dry run/);
    }
  });

  test("should accept --yes flag", () => {
    const result = runCLI(["main", "feature-a", "--yes", "--dry-run"]);
    assert.doesNotMatch(
      result.output + (result.error || ""),
      /Unknown flag/
    );
  });

  test("should accept -y flag", () => {
    const result = runCLI(["main", "feature-a", "-y", "--dry-run"]);
    assert.doesNotMatch(
      result.output + (result.error || ""),
      /Unknown flag/
    );
  });

  test("should accept --host flag", () => {
    const result = runCLI(["main", "feature-a", "--host", "ghe.corp.com", "--dry-run"]);
    assert.doesNotMatch(
      result.output + (result.error || ""),
      /Unknown flag/
    );
  });
});

describe("rebase-stack Security Features", () => {
  test("should reject branch names with invalid characters", () => {
    const result = runCLI(["main", "feat@branch", "--dry-run"]);
    assert.strictEqual(result.success, false);
    assert.match(
      result.output + result.error,
      /Invalid branch name|can only contain/
    );
  });

  test("should reject branch names with double dots", () => {
    const result = runCLI(["main", "feature..main", "--dry-run"]);
    assert.strictEqual(result.success, false);
    assert.match(
      result.output + result.error,
      /Potentially unsafe branch name|cannot start with - or contain \.\./
    );
  });

  test("should reject protected branches in the stack", () => {
    const result = runCLI(["feature-a", "main", "--dry-run"]);
    assert.strictEqual(result.success, false);
    assert.match(
      result.output + result.error,
      /Cannot rebase protected branches/
    );
  });

  test("should allow protected branch as base (first argument)", () => {
    const result = runCLI(["main", "feature-a", "--dry-run"]);
    // Should not fail with protected branch error
    assert.doesNotMatch(
      result.output + (result.error || ""),
      /Cannot rebase protected branches/
    );
  });

  test("should reject non-existent branches in explicit mode", () => {
    const result = runCLI(["main", "this-branch-does-not-exist-xyz", "--dry-run"]);
    assert.strictEqual(result.success, false);
    assert.match(
      result.output + result.error,
      /Branches not found locally/
    );
  });

  test("should reject protected branch as start in auto-discovery", () => {
    const result = runCLI(["main"]);
    assert.strictEqual(result.success, false);
    assert.match(
      result.output + result.error,
      /Cannot start from protected branch/
    );
  });
});
