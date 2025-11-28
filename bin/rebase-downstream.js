#!/usr/bin/env node

/**
 * Rebase Downstream Branches
 *
 * Automatically discovers and rebases all downstream branches in a stacked PR chain.
 * Uses GitHub CLI to find PRs that target the current branch.
 *
 * Usage:
 *   rebase-downstream                       # From current branch
 *   rebase-downstream <branch-name>         # From specific branch
 *   rebase-downstream --dry-run             # Preview only
 *   rebase-downstream --host <hostname>     # Use GitHub Enterprise
 */

const { execSync } = require('child_process');

const VERSION = require('../package.json').version;

const COLORS = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};

function log(message, color = COLORS.reset) {
    console.log(`${color}${message}${COLORS.reset}`);
}

function exec(command, options = {}) {
    try {
        return execSync(command, {
            encoding: 'utf-8',
            stdio: options.silent ? 'pipe' : 'inherit',
            ...options,
        });
    } catch (error) {
        if (options.ignoreError) {
            return null;
        }
        throw error;
    }
}

function getCurrentBranch() {
    return exec('git rev-parse --abbrev-ref HEAD', { silent: true }).trim();
}

function getRemoteUrl() {
    try {
        return exec('git remote get-url origin', { silent: true }).trim();
    } catch {
        return null;
    }
}

/**
 * Detect GitHub Enterprise host from remote URL
 */
function detectGitHubHost() {
    const remoteUrl = getRemoteUrl();
    if (!remoteUrl) {
        return null;
    }

    // Extract host from various URL formats
    // SSH: git@hostname:org/repo.git
    // HTTPS: https://hostname/org/repo.git
    const sshMatch = remoteUrl.match(/^git@([^:]+):/);
    const httpsMatch = remoteUrl.match(/^https?:\/\/([^/]+)\//);

    const host = sshMatch?.[1] || httpsMatch?.[1];

    // Return null for standard GitHub (gh CLI default)
    if (host === 'github.com') {
        return null;
    }

    return host;
}

/**
 * Find all PRs that target a specific branch using GitHub CLI
 */
function findPRsTargeting(baseBranch, host) {
    const hostFlag = host ? `--hostname ${host} ` : '';

    try {
        const result = exec(
            `gh ${hostFlag}pr list --base "${baseBranch}" --state open --json number,headRefName,title --limit 50`,
            { silent: true },
        );

        if (!result) return [];

        const prs = JSON.parse(result);
        return prs.map(pr => ({
            number: pr.number,
            branch: pr.headRefName,
            title: pr.title,
            target: baseBranch,
        }));
    } catch (error) {
        log(`⚠️  Could not fetch PRs targeting ${baseBranch}: ${error.message}`, COLORS.yellow);
        return [];
    }
}

/**
 * Build the complete PR chain starting from a branch
 */
function buildPRChain(startBranch, host) {
    const chain = [];
    const visited = new Set();
    let currentBranch = startBranch;

    log(`\n🔍 Discovering PR chain starting from: ${startBranch}`, COLORS.cyan);
    if (host) {
        log(`   Using GitHub host: ${host}`, COLORS.dim);
    }

    while (true) {
        if (visited.has(currentBranch)) {
            log(`⚠️  Circular reference detected at ${currentBranch}`, COLORS.yellow);
            break;
        }
        visited.add(currentBranch);

        const prs = findPRsTargeting(currentBranch, host);

        if (prs.length === 0) {
            break;
        }

        if (prs.length > 1) {
            log(`\n⚠️  Multiple PRs found targeting ${currentBranch}:`, COLORS.yellow);
            prs.forEach((pr, i) => {
                log(`   ${i + 1}. #${pr.number} ${pr.branch}`, COLORS.dim);
            });
            log(`   Using first one: #${prs[0].number}`, COLORS.dim);
        }

        const pr = prs[0];
        chain.push(pr);
        log(`   Found: #${pr.number} ${pr.branch} → ${pr.target}`, COLORS.dim);
        currentBranch = pr.branch;
    }

    return chain;
}

/**
 * Get the last commit hash that belongs to just this branch (not inherited)
 */
function getBranchOwnCommit(branch, targetBranch) {
    try {
        // Get commits that are in this branch but not in target
        const commits = exec(`git log ${targetBranch}..${branch} --oneline`, { silent: true }).trim();

        if (!commits) return null;

        const lines = commits.split('\n').filter(Boolean);
        // Return the oldest commit (last line) - that's the branch's own commit
        // If there's only one commit, return it
        if (lines.length === 1) {
            return lines[0].split(' ')[0];
        }

        // For multiple commits, we want the most recent one (first line)
        return lines[0].split(' ')[0];
    } catch {
        return null;
    }
}

function rebaseBranch(branch, onto) {
    log(`\n📦 Rebasing ${branch} onto ${onto}...`, COLORS.cyan);

    // Get the commit hash before we switch
    const commitHash = getBranchOwnCommit(branch, onto);

    if (!commitHash) {
        log(`   ⏭️  No unique commits found, skipping`, COLORS.yellow);
        return true;
    }

    log(`   Commit to cherry-pick: ${commitHash}`, COLORS.dim);

    // Checkout and reset
    exec(`git checkout ${branch}`, { silent: true });
    exec(`git reset --hard ${onto}`, { silent: true });

    // Cherry-pick the commit
    try {
        exec(`git cherry-pick ${commitHash}`, { silent: true });
        log(`   ✅ Cherry-picked successfully`, COLORS.green);
    } catch (error) {
        // Check if there's a conflict
        const status = exec('git status --porcelain', { silent: true }) || '';
        if (status.includes('UU') || status.includes('AA') || status.includes('DD')) {
            log(`   ⚠️  Conflict detected! Resolve manually:`, COLORS.yellow);
            log(`      1. Fix conflicts in the files`, COLORS.dim);
            log(`      2. git add <files>`, COLORS.dim);
            log(`      3. git cherry-pick --continue`, COLORS.dim);
            log(`      4. Re-run this script`, COLORS.dim);
            process.exit(1);
        }
        // If empty commit, skip
        exec('git cherry-pick --skip', { silent: true, ignoreError: true });
        log(`   ⏭️  Skipped (no changes or already applied)`, COLORS.yellow);
    }

    return true;
}

function pushBranch(branch) {
    log(`   🚀 Force pushing...`, COLORS.blue);
    exec(`git push origin ${branch} --force-with-lease`, { silent: true });
    log(`   ✅ Pushed`, COLORS.green);
}

function showHelp() {
    log('\n📋 Rebase Downstream Branches', COLORS.bright);
    log('─'.repeat(50));
    log('\nAutomatically discovers and rebases stacked PRs.', COLORS.dim);
    log('\nUsage:', COLORS.cyan);
    log('  rebase-downstream                       # From current branch');
    log('  rebase-downstream <branch>              # From specific branch');
    log('  rebase-downstream --dry-run             # Preview only');
    log('  rebase-downstream --host <hostname>     # Use GitHub Enterprise');
    log('\nOptions:', COLORS.cyan);
    log('  -h, --help       Show this help message');
    log('  -v, --version    Show version number');
    log('  --dry-run        Preview changes without applying them');
    log('  --host <host>    GitHub Enterprise hostname (auto-detected or from GH_HOST)');
    log('\nHow it works:', COLORS.cyan);
    log('  1. Finds PRs that target the specified branch');
    log('  2. Follows the chain to find all downstream PRs');
    log('  3. Rebases each branch onto its updated parent');
    log('  4. Force pushes the rebased branches');
    log('\nRequires:', COLORS.cyan);
    log('  - GitHub CLI (gh) installed and authenticated');
    log('  - https://cli.github.com/');
    log('\nExamples:', COLORS.cyan);
    log('  # Rebase all PRs stacked on current branch');
    log('  rebase-downstream');
    log('\n  # Rebase all PRs stacked on feature-branch');
    log('  rebase-downstream feature-branch');
    log('\n  # Preview what would be rebased');
    log('  rebase-downstream --dry-run');
    log('\n  # Use GitHub Enterprise');
    log('  rebase-downstream --host github.mycompany.com');
    log('');
}

function parseArgs(args) {
    const options = {
        branch: null,
        dryRun: false,
        help: false,
        version: false,
        host: null,
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        
        if (arg === '--help' || arg === '-h') {
            options.help = true;
        } else if (arg === '--version' || arg === '-v') {
            options.version = true;
        } else if (arg === '--dry-run') {
            options.dryRun = true;
        } else if (arg === '--host' && args[i + 1]) {
            options.host = args[++i];
        } else if (!arg.startsWith('-')) {
            options.branch = arg;
        }
    }

    return options;
}

function main() {
    const args = process.argv.slice(2);
    const options = parseArgs(args);

    if (options.help) {
        showHelp();
        process.exit(0);
    }

    if (options.version) {
        log(`rebase-downstream v${VERSION}`);
        process.exit(0);
    }

    // Check for gh CLI
    try {
        exec('gh --version', { silent: true });
    } catch {
        log('❌ GitHub CLI (gh) is required but not found.', COLORS.red);
        log('   Install: https://cli.github.com/', COLORS.dim);
        process.exit(1);
    }

    // Auto-detect host if not provided
    const host = options.host || process.env.GH_HOST || detectGitHubHost();

    // Get the starting branch
    const startBranch = options.branch || getCurrentBranch();

    if (startBranch === 'main' || startBranch === 'master') {
        log(`\n⚠️  Starting from ${startBranch} - this will find ALL stacked PRs`, COLORS.yellow);
    }

    // Build the chain
    const chain = buildPRChain(startBranch, host);

    if (chain.length === 0) {
        log('\n✅ No downstream PRs found. Nothing to rebase.', COLORS.green);
        process.exit(0);
    }

    log('\n🔄 PR Chain to rebase:', COLORS.bright);
    log('─'.repeat(60));
    chain.forEach((item, i) => {
        log(`  ${i + 1}. #${item.number} ${item.branch}`, COLORS.reset);
        log(`     └── targets: ${item.target}`, COLORS.dim);
    });

    if (options.dryRun) {
        log('\n📝 Dry run - no changes made', COLORS.yellow);
        process.exit(0);
    }

    log('\n⚠️  This will force-push the above branches.', COLORS.yellow);

    // Save current branch
    const originalBranch = getCurrentBranch();

    log('\n🚀 Starting rebase...', COLORS.bright);
    log('─'.repeat(50));

    // Fetch latest
    log('\n📥 Fetching latest from origin...', COLORS.cyan);
    exec('git fetch origin', { silent: true });

    let successCount = 0;

    for (const item of chain) {
        try {
            // Make sure we have the latest target
            exec(`git checkout ${item.target}`, { silent: true, ignoreError: true });
            exec(`git pull origin ${item.target} --ff-only`, { silent: true, ignoreError: true });

            rebaseBranch(item.branch, item.target);
            pushBranch(item.branch);
            successCount++;
        } catch (error) {
            log(`\n❌ Failed at ${item.branch}: ${error.message}`, COLORS.red);
            break;
        }
    }

    // Return to original branch
    exec(`git checkout ${originalBranch}`, { silent: true, ignoreError: true });

    log('\n' + '─'.repeat(50));
    log(`✅ Rebased ${successCount}/${chain.length} branches`, COLORS.green);

    if (successCount < chain.length) {
        process.exit(1);
    }
}

main();

