const { test, describe, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

// Helpers to create and manage temporary git repos

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "rdb-test-"));
}

function removeTempDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function git(dir, command) {
  return execSync(`git ${command}`, {
    cwd: dir,
    encoding: "utf-8",
    stdio: "pipe",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Test",
      GIT_AUTHOR_EMAIL: "test@test.com",
      GIT_COMMITTER_NAME: "Test",
      GIT_COMMITTER_EMAIL: "test@test.com",
    },
  }).trim();
}

function initRepo(dir) {
  git(dir, "init -b main");
  git(dir, "config user.name Test");
  git(dir, "config user.email test@test.com");
  // Create initial commit
  fs.writeFileSync(path.join(dir, "README.md"), "# Test repo\n");
  git(dir, "add .");
  git(dir, 'commit -m "initial commit"');
}

function addCommit(dir, filename, content, message) {
  fs.writeFileSync(path.join(dir, filename), content);
  git(dir, `add ${filename}`);
  git(dir, `commit -m "${message}"`);
}

function getCommitHash(dir, ref) {
  return git(dir, `rev-parse ${ref}`);
}

function getCommitMessages(dir, range) {
  return git(dir, `log ${range} --format=%s`);
}

function readFile(dir, filename) {
  return fs.readFileSync(path.join(dir, filename), "utf-8");
}

// ─── Unit Tests for Pure Functions ───────────────────────────────────

describe("Validation", () => {
  const {
    sanitizeBranchName,
    isProtectedBranch,
  } = require("../bin/utils/validation");

  test("accepts standard branch names", () => {
    assert.strictEqual(sanitizeBranchName("feature/my-branch"), "feature/my-branch");
    assert.strictEqual(sanitizeBranchName("fix.1.0"), "fix.1.0");
    assert.strictEqual(sanitizeBranchName("my_branch"), "my_branch");
    assert.strictEqual(sanitizeBranchName("CAPS123"), "CAPS123");
  });

  test("rejects names with shell metacharacters", () => {
    assert.throws(() => sanitizeBranchName("branch;rm -rf /"), /Invalid branch name/);
    assert.throws(() => sanitizeBranchName("branch$(cmd)"), /Invalid branch name/);
    assert.throws(() => sanitizeBranchName("branch`cmd`"), /Invalid branch name/);
    assert.throws(() => sanitizeBranchName("branch|pipe"), /Invalid branch name/);
    assert.throws(() => sanitizeBranchName("branch&bg"), /Invalid branch name/);
    assert.throws(() => sanitizeBranchName("branch name"), /Invalid branch name/);
  });

  test("rejects names starting with dash", () => {
    assert.throws(() => sanitizeBranchName("-bad"), /Potentially unsafe/);
  });

  test("rejects names with double dots", () => {
    assert.throws(() => sanitizeBranchName("a..b"), /Potentially unsafe/);
  });

  test("rejects empty and whitespace-only names", () => {
    assert.throws(() => sanitizeBranchName(""), /Invalid branch name/);
    assert.throws(() => sanitizeBranchName(" "), /Invalid branch name/);
  });

  test("identifies protected branches case-insensitively", () => {
    assert.strictEqual(isProtectedBranch("main"), true);
    assert.strictEqual(isProtectedBranch("Main"), true);
    assert.strictEqual(isProtectedBranch("MASTER"), true);
    assert.strictEqual(isProtectedBranch("develop"), true);
    assert.strictEqual(isProtectedBranch("production"), true);
    assert.strictEqual(isProtectedBranch("prod"), true);
    assert.strictEqual(isProtectedBranch("staging"), true);
  });

  test("does not flag non-protected branches", () => {
    assert.strictEqual(isProtectedBranch("feature/main-page"), false);
    assert.strictEqual(isProtectedBranch("dev"), false);
    assert.strictEqual(isProtectedBranch("release/1.0"), false);
  });
});

describe("Argument Parsing", () => {
  const { parseArgs } = require("../bin/cli/args-parser");

  test("parses all flags correctly", () => {
    const opts = parseArgs([
      "my-branch",
      "--dry-run",
      "--host",
      "ghe.corp.com",
      "--yes",
    ]);
    assert.strictEqual(opts.branch, "my-branch");
    assert.strictEqual(opts.dryRun, true);
    assert.strictEqual(opts.host, "ghe.corp.com");
    assert.strictEqual(opts.skipConfirmation, true);
  });

  test("parses short flags", () => {
    const opts = parseArgs(["-h"]);
    assert.strictEqual(opts.help, true);
    const opts2 = parseArgs(["-v"]);
    assert.strictEqual(opts2.version, true);
    const opts3 = parseArgs(["-y"]);
    assert.strictEqual(opts3.skipConfirmation, true);
  });

  test("defaults all options when no args given", () => {
    const opts = parseArgs([]);
    assert.strictEqual(opts.branch, null);
    assert.strictEqual(opts.dryRun, false);
    assert.strictEqual(opts.help, false);
    assert.strictEqual(opts.version, false);
    assert.strictEqual(opts.host, null);
    assert.strictEqual(opts.skipConfirmation, false);
  });

  test("--host without value is silently ignored", () => {
    const opts = parseArgs(["--host"]);
    assert.strictEqual(opts.host, null);
  });

  test("branch is first non-flag argument", () => {
    const opts = parseArgs(["--dry-run", "my-branch", "--yes"]);
    assert.strictEqual(opts.branch, "my-branch");
  });

  test("unknown flags are ignored, not treated as branch", () => {
    const opts = parseArgs(["--unknown-flag"]);
    // Starts with -, so not treated as branch
    assert.strictEqual(opts.branch, null);
  });
});

describe("GitHub Host Detection", () => {
  const { detectGitHubHost } = require("../bin/utils/github");

  test("returns null for github.com SSH remote", () => {
    assert.strictEqual(
      detectGitHubHost("git@github.com:user/repo.git"),
      null
    );
  });

  test("returns null for github.com HTTPS remote", () => {
    assert.strictEqual(
      detectGitHubHost("https://github.com/user/repo.git"),
      null
    );
  });

  test("detects GHE SSH remote", () => {
    assert.strictEqual(
      detectGitHubHost("git@ghe.corp.com:org/repo.git"),
      "ghe.corp.com"
    );
  });

  test("detects GHE HTTPS remote", () => {
    assert.strictEqual(
      detectGitHubHost("https://ghe.corp.com/org/repo.git"),
      "ghe.corp.com"
    );
  });

  test("returns null for null/undefined input", () => {
    assert.strictEqual(detectGitHubHost(null), null);
    assert.strictEqual(detectGitHubHost(undefined), null);
    assert.strictEqual(detectGitHubHost(""), null);
  });
});

// ─── Integration Tests with Real Git Repos ───────────────────────────

describe("Git Utilities (real repo)", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir();
    initRepo(tmpDir);
  });

  afterEach(() => {
    removeTempDir(tmpDir);
  });

  test("getBranchOwnCommits returns only branch-specific commits", () => {
    // Create a feature branch with 2 commits
    git(tmpDir, "checkout -b feature");
    addCommit(tmpDir, "a.txt", "a", "feat: add a");
    addCommit(tmpDir, "b.txt", "b", "feat: add b");

    const { getBranchOwnCommits } = require("../bin/utils/git");

    // Temporarily override cwd for git commands
    const origCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      const commits = getBranchOwnCommits("feature", "main");
      assert.strictEqual(commits.length, 2);
      // Commits should be newest-first (git log order)
      const messages = getCommitMessages(tmpDir, "main..feature");
      assert.match(messages, /feat: add b/);
      assert.match(messages, /feat: add a/);
    } finally {
      process.chdir(origCwd);
    }
  });

  test("getBranchOwnCommits returns empty array when no unique commits", () => {
    const { getBranchOwnCommits } = require("../bin/utils/git");
    const origCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      const commits = getBranchOwnCommits("main", "main");
      assert.strictEqual(commits.length, 0);
    } finally {
      process.chdir(origCwd);
    }
  });

  test("getWorktreeBranches returns branches checked out in worktrees", () => {
    const { getWorktreeBranches } = require("../bin/utils/git");
    git(tmpDir, "checkout -b feature");
    addCommit(tmpDir, "wt.txt", "x", "worktree commit");
    git(tmpDir, "checkout main");

    const origCwd = process.cwd();
    process.chdir(tmpDir);
    // Use a named worktree add (not --detach) to simulate a user-created worktree lock.
    const wtDir = path.join(os.tmpdir(), `rdb-test-wt-${Date.now()}`);
    try {
      const before = getWorktreeBranches();
      assert.ok(!before.has("feature"), "feature should not be locked yet");

      git(tmpDir, `worktree add "${wtDir}" feature`);
      const after = getWorktreeBranches();
      assert.ok(after.has("feature"), "feature should be locked after worktree add");
    } finally {
      try { git(tmpDir, `worktree remove "${wtDir}" --force`); } catch { /* ignore */ }
      process.chdir(origCwd);
    }
  });
});

describe("Backup (real repo)", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir();
    initRepo(tmpDir);
  });

  afterEach(() => {
    removeTempDir(tmpDir);
  });

  test("createBackup creates a ref pointing to the correct commit", () => {
    git(tmpDir, "checkout -b feature");
    addCommit(tmpDir, "a.txt", "content", "feature commit");

    const expectedHash = getCommitHash(tmpDir, "feature");

    const { createBackup } = require("../bin/utils/backup");
    const origCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      const backupRef = createBackup("feature");
      assert.ok(backupRef);
      assert.match(backupRef, /^refs\/backup\/feature-/);

      // Verify the ref points to the same commit
      const backupHash = getCommitHash(tmpDir, backupRef);
      assert.strictEqual(backupHash, expectedHash);
    } finally {
      process.chdir(origCwd);
    }
  });
});

describe("Rebase Logic (real repo)", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir();
    initRepo(tmpDir);
  });

  afterEach(() => {
    removeTempDir(tmpDir);
  });

  test("rebaseBranch cherry-picks commits onto updated target", () => {
    // Setup: main has commit A, feature branches from it with B and C
    // Then main gets a new commit D. Rebase feature onto main.
    addCommit(tmpDir, "base.txt", "base", "base commit on main");

    git(tmpDir, "checkout -b feature");
    addCommit(tmpDir, "feat1.txt", "feat1", "feat: first");
    addCommit(tmpDir, "feat2.txt", "feat2", "feat: second");

    git(tmpDir, "checkout main");
    addCommit(tmpDir, "main-new.txt", "new", "main: new work");

    const { rebaseBranch } = require("../bin/core/rebase");
    const origCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      rebaseBranch("feature", "main");

      // Feature should now be on top of main
      const mainHash = getCommitHash(tmpDir, "main");
      // The parent of the oldest cherry-picked commit should be main HEAD
      const featureLog = git(tmpDir, "log feature --oneline");
      assert.match(featureLog, /feat: first/);
      assert.match(featureLog, /feat: second/);
      assert.match(featureLog, /main: new work/);

      // Files from both main and feature should exist
      assert.ok(fs.existsSync(path.join(tmpDir, "main-new.txt")));
      assert.ok(fs.existsSync(path.join(tmpDir, "feat1.txt")));
      assert.ok(fs.existsSync(path.join(tmpDir, "feat2.txt")));
    } finally {
      process.chdir(origCwd);
    }
  });

  test("rebaseBranch skips empty commits gracefully", () => {
    // Create a commit on feature that will be empty after rebase
    // because main already has the same change
    addCommit(tmpDir, "shared.txt", "same content", "add shared on main");

    git(tmpDir, "checkout -b feature HEAD~1");
    addCommit(tmpDir, "shared.txt", "same content", "add shared on feature");
    addCommit(tmpDir, "unique.txt", "unique", "feat: unique work");

    // Return to main so feature is not the current branch (worktree lock)
    git(tmpDir, "checkout main");

    const { rebaseBranch } = require("../bin/core/rebase");
    const origCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      // Should not throw: the duplicate commit should be skipped
      rebaseBranch("feature", "main");

      // unique.txt should exist
      assert.ok(fs.existsSync(path.join(tmpDir, "unique.txt")));
      // shared.txt should have the correct content
      assert.strictEqual(readFile(tmpDir, "shared.txt"), "same content");
    } finally {
      process.chdir(origCwd);
    }
  });

  test("rebaseBranch throws on conflict instead of calling process.exit", () => {
    // Create conflicting changes
    addCommit(tmpDir, "conflict.txt", "main version", "main: add conflict file");

    git(tmpDir, "checkout -b feature HEAD~1");
    addCommit(
      tmpDir,
      "conflict.txt",
      "feature version",
      "feat: add conflict file"
    );

    // Return to main so feature is not the current branch (worktree lock)
    git(tmpDir, "checkout main");

    const { rebaseBranch } = require("../bin/core/rebase");
    const origCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      assert.throws(
        () => rebaseBranch("feature", "main"),
        (err) => {
          assert.ok(err instanceof Error);
          assert.match(err.message, /Conflict detected/);
          assert.strictEqual(err.isConflict, true);
          return true;
        }
      );
    } finally {
      // Clean up any in-progress cherry-pick
      try {
        git(tmpDir, "cherry-pick --abort");
      } catch {
        // ignore
      }
      process.chdir(origCwd);
    }
  });

  test("rebaseBranch preserves commit order (oldest first)", () => {
    git(tmpDir, "checkout -b feature");
    addCommit(tmpDir, "first.txt", "1", "commit-1-first");
    addCommit(tmpDir, "second.txt", "2", "commit-2-second");
    addCommit(tmpDir, "third.txt", "3", "commit-3-third");

    git(tmpDir, "checkout main");
    addCommit(tmpDir, "main-extra.txt", "extra", "main: extra");

    const { rebaseBranch } = require("../bin/core/rebase");
    const origCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      rebaseBranch("feature", "main");

      // Verify order: oldest commit should be closest to main
      const log = git(tmpDir, "log feature --oneline --reverse");
      const lines = log.split("\n").map((l) => l.split(" ").slice(1).join(" "));
      const commitIdx1 = lines.findIndex((l) => l === "commit-1-first");
      const commitIdx2 = lines.findIndex((l) => l === "commit-2-second");
      const commitIdx3 = lines.findIndex((l) => l === "commit-3-third");

      assert.ok(commitIdx1 < commitIdx2, "commit-1 should come before commit-2");
      assert.ok(commitIdx2 < commitIdx3, "commit-2 should come before commit-3");
    } finally {
      process.chdir(origCwd);
    }
  });

  test("rebaseBranch with no unique commits returns without error", () => {
    // Feature branch at same point as main
    git(tmpDir, "checkout -b feature");

    const { rebaseBranch } = require("../bin/core/rebase");
    const origCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      const result = rebaseBranch("feature", "main");
      assert.strictEqual(result, true);
    } finally {
      process.chdir(origCwd);
    }
  });

  test("rebaseBranch works when branch is locked by an existing worktree", () => {
    // Setup: feature has a commit; main gets a new commit; feature is checked
    // out in a worktree. rebaseBranch must succeed without touching the worktree.
    git(tmpDir, "checkout -b feature");
    addCommit(tmpDir, "feat.txt", "feat", "feat: feature work");

    git(tmpDir, "checkout main");
    addCommit(tmpDir, "main-new.txt", "new", "main: new work");

    const { rebaseBranch } = require("../bin/core/rebase");

    const origCwd = process.cwd();
    process.chdir(tmpDir);
    // Lock the branch via a worktree using a known path so rebaseBranch's
    // internal addWorktree() uses a different (timestamp-based) path.
    const wtDir = path.join(os.tmpdir(), `rdb-test-locked-${Date.now()}`);
    try {
      git(tmpDir, `worktree add "${wtDir}" feature`);

      rebaseBranch("feature", "main");

      // feature branch ref should now include main's new commit
      const featureLog = git(tmpDir, "log feature --oneline");
      assert.match(featureLog, /feat: feature work/);
      assert.match(featureLog, /main: new work/);
    } finally {
      try { git(tmpDir, `worktree remove "${wtDir}" --force`); } catch { /* ignore */ }
      process.chdir(origCwd);
    }
  });
});

// ─── rebase-stack Integration Tests ─────────────────────────────────

describe("rebaseFromCommits (real repo)", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = createTempDir();
    initRepo(tmpDir);
  });

  afterEach(() => {
    removeTempDir(tmpDir);
  });

  test("rebases branch using pre-captured commit hashes", () => {
    addCommit(tmpDir, "base.txt", "base", "base commit on main");

    git(tmpDir, "checkout -b feature");
    addCommit(tmpDir, "feat1.txt", "feat1", "feat: first");
    addCommit(tmpDir, "feat2.txt", "feat2", "feat: second");

    git(tmpDir, "checkout main");
    addCommit(tmpDir, "main-new.txt", "new", "main: new work");

    const { getBranchOwnCommits } = require("../bin/utils/git");
    const { rebaseFromCommits } = require("../bin/core/rebase-stack");
    const origCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      // Capture commits upfront (oldest-first after reverse)
      const commits = getBranchOwnCommits("feature", "main");
      commits.reverse();

      rebaseFromCommits("feature", "main", commits);

      const featureLog = git(tmpDir, "log feature --oneline");
      assert.match(featureLog, /feat: first/);
      assert.match(featureLog, /feat: second/);
      assert.match(featureLog, /main: new work/);

      assert.ok(fs.existsSync(path.join(tmpDir, "main-new.txt")));
      assert.ok(fs.existsSync(path.join(tmpDir, "feat1.txt")));
      assert.ok(fs.existsSync(path.join(tmpDir, "feat2.txt")));
    } finally {
      process.chdir(origCwd);
    }
  });

  test("skips empty commits gracefully", () => {
    addCommit(tmpDir, "shared.txt", "same content", "add shared on main");

    git(tmpDir, "checkout -b feature HEAD~1");
    addCommit(tmpDir, "shared.txt", "same content", "add shared on feature");
    addCommit(tmpDir, "unique.txt", "unique", "feat: unique work");

    git(tmpDir, "checkout main");

    const { getBranchOwnCommits } = require("../bin/utils/git");
    const { rebaseFromCommits } = require("../bin/core/rebase-stack");
    const origCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      const commits = getBranchOwnCommits("feature", "main");
      commits.reverse();

      rebaseFromCommits("feature", "main", commits);

      assert.ok(fs.existsSync(path.join(tmpDir, "unique.txt")));
      assert.strictEqual(readFile(tmpDir, "shared.txt"), "same content");
    } finally {
      process.chdir(origCwd);
    }
  });

  test("throws on conflict with isConflict flag", () => {
    addCommit(tmpDir, "conflict.txt", "main version", "main: add conflict file");

    git(tmpDir, "checkout -b feature HEAD~1");
    addCommit(tmpDir, "conflict.txt", "feature version", "feat: add conflict file");

    git(tmpDir, "checkout main");

    const { getBranchOwnCommits } = require("../bin/utils/git");
    const { rebaseFromCommits } = require("../bin/core/rebase-stack");
    const origCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      const commits = getBranchOwnCommits("feature", "main");
      commits.reverse();

      assert.throws(
        () => rebaseFromCommits("feature", "main", commits),
        (err) => {
          assert.ok(err instanceof Error);
          assert.match(err.message, /Conflict detected/);
          assert.strictEqual(err.isConflict, true);
          return true;
        }
      );
    } finally {
      try { git(tmpDir, "cherry-pick --abort"); } catch { /* ignore */ }
      process.chdir(origCwd);
    }
  });

  test("fast-forwards branch when no own commits", () => {
    git(tmpDir, "checkout -b feature");
    git(tmpDir, "checkout main");
    addCommit(tmpDir, "main-new.txt", "new", "main: new work");

    const { rebaseFromCommits } = require("../bin/core/rebase-stack");
    const origCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      rebaseFromCommits("feature", "main", []);

      // feature should now point to main's HEAD
      const featureHash = getCommitHash(tmpDir, "feature");
      const mainHash = getCommitHash(tmpDir, "main");
      assert.strictEqual(featureHash, mainHash);
    } finally {
      process.chdir(origCwd);
    }
  });

  test("works when branch is locked by an existing worktree", () => {
    git(tmpDir, "checkout -b feature");
    addCommit(tmpDir, "feat.txt", "feat", "feat: feature work");

    git(tmpDir, "checkout main");
    addCommit(tmpDir, "main-new.txt", "new", "main: new work");

    const { getBranchOwnCommits } = require("../bin/utils/git");
    const { rebaseFromCommits } = require("../bin/core/rebase-stack");
    const origCwd = process.cwd();
    process.chdir(tmpDir);
    const wtDir = path.join(os.tmpdir(), `rdb-test-locked-stack-${Date.now()}`);
    try {
      const commits = getBranchOwnCommits("feature", "main");
      commits.reverse();

      // Lock the branch in a worktree
      git(tmpDir, `worktree add "${wtDir}" feature`);

      rebaseFromCommits("feature", "main", commits);

      const featureLog = git(tmpDir, "log feature --oneline");
      assert.match(featureLog, /feat: feature work/);
      assert.match(featureLog, /main: new work/);
    } finally {
      try { git(tmpDir, `worktree remove "${wtDir}" --force`); } catch { /* ignore */ }
      process.chdir(origCwd);
    }
  });

  test("full stack rebase with upfront commit capture survives hash drift", () => {
    // This is the critical test: rebase a 3-branch stack onto an updated main.
    // After rebasing branch-a, its hashes change. If branch-b's commits were
    // computed at rebase time, git log would return stale parent commits.
    // With upfront capture, only branch-b's own commits are cherry-picked.

    // main: initial + base commit
    addCommit(tmpDir, "base.txt", "base", "base on main");

    // branch-a: 2 commits on top of main
    git(tmpDir, "checkout -b branch-a");
    addCommit(tmpDir, "a1.txt", "a1", "branch-a: first");
    addCommit(tmpDir, "a2.txt", "a2", "branch-a: second");

    // branch-b: 1 commit on top of branch-a
    git(tmpDir, "checkout -b branch-b");
    addCommit(tmpDir, "b1.txt", "b1", "branch-b: work");

    // branch-c: 1 commit on top of branch-b
    git(tmpDir, "checkout -b branch-c");
    addCommit(tmpDir, "c1.txt", "c1", "branch-c: work");

    // main advances with a new commit
    git(tmpDir, "checkout main");
    addCommit(tmpDir, "main-new.txt", "new", "main: new work after branches");

    const { getBranchOwnCommits } = require("../bin/utils/git");
    const { rebaseFromCommits } = require("../bin/core/rebase-stack");
    const origCwd = process.cwd();
    process.chdir(tmpDir);
    try {
      // Step 1: capture all own commits BEFORE any rebasing
      const commitsA = getBranchOwnCommits("branch-a", "main");
      commitsA.reverse();
      const commitsB = getBranchOwnCommits("branch-b", "branch-a");
      commitsB.reverse();
      const commitsC = getBranchOwnCommits("branch-c", "branch-b");
      commitsC.reverse();

      assert.strictEqual(commitsA.length, 2, "branch-a should have 2 own commits");
      assert.strictEqual(commitsB.length, 1, "branch-b should have 1 own commit");
      assert.strictEqual(commitsC.length, 1, "branch-c should have 1 own commit");

      // Step 2: rebase sequentially using pre-captured commits
      git(tmpDir, "checkout main");
      rebaseFromCommits("branch-a", "main", commitsA);
      rebaseFromCommits("branch-b", "branch-a", commitsB);
      rebaseFromCommits("branch-c", "branch-b", commitsC);

      // Step 3: verify linear ancestry
      const mainHash = getCommitHash(tmpDir, "main");
      const aBase = git(tmpDir, "merge-base main branch-a");
      assert.strictEqual(aBase, mainHash, "branch-a should be based on main HEAD");

      const aHash = getCommitHash(tmpDir, "branch-a");
      const bBase = git(tmpDir, "merge-base branch-a branch-b");
      assert.strictEqual(bBase, aHash, "branch-b should be based on branch-a HEAD");

      const bHash = getCommitHash(tmpDir, "branch-b");
      const cBase = git(tmpDir, "merge-base branch-b branch-c");
      assert.strictEqual(cBase, bHash, "branch-c should be based on branch-b HEAD");

      // Step 4: verify each branch has correct own commits
      const aLog = getCommitMessages(tmpDir, "main..branch-a");
      assert.match(aLog, /branch-a: first/);
      assert.match(aLog, /branch-a: second/);
      assert.doesNotMatch(aLog, /branch-b/);

      const bLog = getCommitMessages(tmpDir, "branch-a..branch-b");
      assert.match(bLog, /branch-b: work/);
      assert.doesNotMatch(bLog, /branch-a/);

      const cLog = getCommitMessages(tmpDir, "branch-b..branch-c");
      assert.match(cLog, /branch-c: work/);
      assert.doesNotMatch(cLog, /branch-b/);

      // Step 5: verify all files exist on the final branch
      git(tmpDir, "checkout branch-c");
      assert.ok(fs.existsSync(path.join(tmpDir, "base.txt")));
      assert.ok(fs.existsSync(path.join(tmpDir, "main-new.txt")));
      assert.ok(fs.existsSync(path.join(tmpDir, "a1.txt")));
      assert.ok(fs.existsSync(path.join(tmpDir, "a2.txt")));
      assert.ok(fs.existsSync(path.join(tmpDir, "b1.txt")));
      assert.ok(fs.existsSync(path.join(tmpDir, "c1.txt")));
    } finally {
      process.chdir(origCwd);
    }
  });
});

describe("Chain Builder", () => {
  const { getBranchesInChain } = require("../bin/core/chain-builder");

  test("getBranchesInChain extracts branch names from chain", () => {
    const chain = [
      { branch: "feat-a", target: "main", number: 1 },
      { branch: "feat-b", target: "feat-a", number: 2 },
      { branch: "feat-c", target: "feat-b", number: 3 },
    ];
    assert.deepStrictEqual(getBranchesInChain(chain), [
      "feat-a",
      "feat-b",
      "feat-c",
    ]);
  });

  test("getBranchesInChain returns empty array for empty chain", () => {
    assert.deepStrictEqual(getBranchesInChain([]), []);
  });
});

describe("Colors", () => {
  const { COLORS, log } = require("../bin/utils/colors");

  test("COLORS has all expected keys", () => {
    const expectedKeys = [
      "reset",
      "bright",
      "dim",
      "red",
      "green",
      "yellow",
      "blue",
      "cyan",
    ];
    for (const key of expectedKeys) {
      assert.ok(COLORS[key], `Missing color: ${key}`);
    }
  });

  test("log function does not throw", () => {
    assert.doesNotThrow(() => log("test message"));
    assert.doesNotThrow(() => log("test message", COLORS.red));
  });
});
