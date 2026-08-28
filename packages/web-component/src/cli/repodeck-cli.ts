/**
 * repodeck CLI entry point.
 *
 * Tiny command dispatcher — keeps the CLI dependency-free (no commander /
 * yargs) so it ships without security/supply-chain surface area.
 *
 * Commands:
 *   repodeck init   — create the config-repodeck/ folder with templates
 *   repodeck validate <owner>/<repo> — perform a build-time probe via @repodeck/core
 *   repodeck --help — show usage
 *
 * Exits non-zero on any failure so it composes cleanly with CI.
 *
 * The shebang is added by the tsup build (banner injection), so it's not
 * here in source.
 */

import { runInit } from './commands/init';
import { runValidate } from './commands/validate';

const HELP = `Usage:
  repodeck init [--force] [--repo <name>]
  repodeck validate <owner>/<repo>
  repodeck help

Commands:
  init      Create a config-repodeck/ folder with starter templates.
            --repo <name>  Pre-fills the README template's repo name.
            --force        Merge into an existing config-repodeck/ folder
                           (existing files are never overwritten).
  validate  Probe a GitHub repo for a configured config-repodeck/ folder.
            Reads GITHUB_TOKEN from the environment when present.

Examples:
  npx repodeck init
  npx repodeck validate facebook/react
  GITHUB_TOKEN=ghp_xxx npx repodeck validate my-org/private-repo
`;

async function main(argv) {
  const [, , cmd, ...rest] = argv;

  if (!cmd || cmd === 'help' || cmd === '-h' || cmd === '--help') {
    process.stdout.write(HELP);
    return;
  }

  switch (cmd) {
    case 'init': {
      const force = rest.includes('--force') || rest.includes('-f');
      const repoIdx = rest.indexOf('--repo');
      const repoName = repoIdx !== -1 ? rest[repoIdx + 1] : undefined;
      await runInit({ cwd: process.cwd(), force, repoName, stdout: process.stdout, stderr: process.stderr });
      return;
    }
    case 'validate': {
      const target = rest[0];
      if (!target || !/^[\w.-]+\/[\w.-]+$/.test(target)) {
        process.stderr.write('validate: expected an <owner>/<repo> argument.\n\n' + HELP);
        process.exit(64); // EX_USAGE
      }
      const [owner, repo] = target.split('/');
      const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || undefined;
      const exitCode = await runValidate({ owner, repo, token, stdout: process.stdout, stderr: process.stderr });
      process.exit(exitCode);
      return;
    }
    default:
      process.stderr.write(`Unknown command: ${cmd}\n\n${HELP}`);
      process.exit(64);
  }
}

main(process.argv).catch((err) => {
  process.stderr.write(`repodeck: unexpected error: ${err && err.message ? err.message : String(err)}\n`);
  if (process.env.DEBUG) process.stderr.write((err && err.stack ? err.stack : '') + '\n');
  process.exit(1);
});
