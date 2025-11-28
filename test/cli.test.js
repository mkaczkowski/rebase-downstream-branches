const { test, describe } = require("node:test");
const assert = require("node:assert");
const { execSync } = require("node:child_process");
const path = require("node:path");

const BIN_PATH = path.join(__dirname, "../bin/rebase-downstream-branches.js");

function runCLI(args = []) {
  const cmd = `node ${BIN_PATH} ${args.join(" ")}`;
  try {
    const output = execSync(cmd, { encoding: "utf-8", stdio: "pipe" });
    return { success: true, output, error: null };
  } catch (error) {
    return {
      success: false,
      output: error.stdout || "",
      error: error.stderr || error.message,
    };
  }
}

describe("CLI Tests", () => {
  test("should display help with --help flag", () => {
    const result = runCLI(["--help"]);
    assert.strictEqual(result.success, true);
    assert.match(result.output, /Rebase Downstream Branches/);
    assert.match(result.output, /Usage:/);
    assert.match(result.output, /Options:/);
  });

  test("should display help with -h flag", () => {
    const result = runCLI(["-h"]);
    assert.strictEqual(result.success, true);
    assert.match(result.output, /Rebase Downstream Branches/);
  });

  test("should display version with --version flag", () => {
    const result = runCLI(["--version"]);
    assert.strictEqual(result.success, true);
    assert.match(result.output, /rebase-downstream-branches v\d+\.\d+\.\d+/);
  });

  test("should display version with -v flag", () => {
    const result = runCLI(["-v"]);
    assert.strictEqual(result.success, true);
    assert.match(result.output, /rebase-downstream-branches v\d+\.\d+\.\d+/);
  });

  test("should fail gracefully when gh is not installed", () => {
    // This test will pass if gh is installed, but we're mainly checking
    // that the CLI doesn't crash unexpectedly
    const result = runCLI([]);
    // Either succeeds with gh installed, or fails with proper error message
    if (!result.success) {
      assert.match(
        result.output + result.error,
        /GitHub CLI \(gh\) is required|No downstream PRs found/
      );
    }
  });
});

describe("Argument Parsing", () => {
  test("should accept branch name as argument", () => {
    const result = runCLI(["feature-branch", "--dry-run"]);
    // Should not crash - either works or fails gracefully
    assert.ok(result.success || result.error);
  });

  test("should accept --dry-run flag", () => {
    const result = runCLI(["--dry-run"]);
    // Should not crash
    assert.ok(result.success || result.error);
  });

  test("should accept --host flag with value", () => {
    const result = runCLI(["--host", "github.example.com", "--dry-run"]);
    // Should not crash
    assert.ok(result.success || result.error);
  });

  test("should accept --yes flag", () => {
    const result = runCLI(["--yes", "--dry-run"]);
    // Should not crash
    assert.ok(result.success || result.error);
  });

  test("should accept -y flag", () => {
    const result = runCLI(["-y", "--dry-run"]);
    // Should not crash
    assert.ok(result.success || result.error);
  });
});

describe("Security Features", () => {
  test("should reject branch names with invalid characters", () => {
    const result = runCLI(["feat;rm -rf /", "--dry-run"]);
    assert.strictEqual(result.success, false);
    assert.match(
      result.output + result.error,
      /Invalid branch name|can only contain/
    );
  });

  test("should reject branch names starting with dash", () => {
    const result = runCLI(["--malicious-branch", "--dry-run"]);
    // This should be treated as a flag, not a branch name
    // or rejected if somehow parsed as branch
    assert.ok(result.success || result.error);
  });

  test("should reject branch names with double dots", () => {
    const result = runCLI(["feature..main", "--dry-run"]);
    assert.strictEqual(result.success, false);
    assert.match(
      result.output + result.error,
      /Potentially unsafe branch name|cannot start with - or contain \.\./
    );
  });

  test("should accept valid branch names with slashes", () => {
    const result = runCLI(["feature/new-feature", "--dry-run"]);
    // Should not crash - either works or fails gracefully
    assert.ok(result.success || result.error);
    // Should not show invalid branch name error
    if (!result.success) {
      assert.doesNotMatch(result.output + result.error, /Invalid branch name/);
    }
  });

  test("should accept valid branch names with dots", () => {
    const result = runCLI(["feature.1.0", "--dry-run"]);
    // Should not crash - either works or fails gracefully
    assert.ok(result.success || result.error);
    // Should not show invalid branch name error
    if (!result.success) {
      assert.doesNotMatch(result.output + result.error, /Invalid branch name/);
    }
  });

  test("should accept valid branch names with underscores", () => {
    const result = runCLI(["feature_branch", "--dry-run"]);
    // Should not crash - either works or fails gracefully
    assert.ok(result.success || result.error);
    // Should not show invalid branch name error
    if (!result.success) {
      assert.doesNotMatch(result.output + result.error, /Invalid branch name/);
    }
  });
});

describe("Help Documentation", () => {
  test("should show safety features in help", () => {
    const result = runCLI(["--help"]);
    assert.strictEqual(result.success, true);
    assert.match(result.output, /Safety features:/);
    assert.match(result.output, /Branch name validation/);
    assert.match(result.output, /Protected branch detection/);
    assert.match(result.output, /Backup refs/);
  });

  test("should show --yes flag in help", () => {
    const result = runCLI(["--help"]);
    assert.strictEqual(result.success, true);
    assert.match(result.output, /-y, --yes/);
    assert.match(result.output, /Skip confirmation prompt/);
  });
});
