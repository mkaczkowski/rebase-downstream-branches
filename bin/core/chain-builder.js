/**
 * PR chain building logic
 */

const { findPRsTargeting } = require("../utils/github");
const { log, COLORS } = require("../utils/colors");

/**
 * Get list of branches that would be modified
 */
function getBranchesInChain(chain) {
  return chain.map((item) => item.branch);
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

  // eslint-disable-next-line no-constant-condition
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
      log(
        `\n⚠️  Multiple PRs found targeting ${currentBranch}:`,
        COLORS.yellow
      );
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

module.exports = {
  getBranchesInChain,
  buildPRChain,
};
