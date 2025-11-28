/**
 * Argument parsing utilities
 */

/**
 * Parse command-line arguments
 */
function parseArgs(args) {
  const options = {
    branch: null,
    dryRun: false,
    help: false,
    version: false,
    host: null,
    skipConfirmation: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--version" || arg === "-v") {
      options.version = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--host" && args[i + 1]) {
      options.host = args[++i];
    } else if (arg === "--yes" || arg === "-y") {
      options.skipConfirmation = true;
    } else if (!arg.startsWith("-")) {
      options.branch = arg;
    }
  }

  return options;
}

module.exports = {
  parseArgs,
};
