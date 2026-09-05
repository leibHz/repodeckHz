/**
 * repodeck CLI — `validate <owner>/<repo>` command.
 *
 * Reuses @repodeckhz/core's CardBuilder with a 12-second timeout so the probe
 * never hangs forever. Prints a clear summary of what's present and what's
 * missing, intended for use both interactively and in CI.
 */

import { CardBuilder, GitHubClient, RepoDeckError } from '@repodeckhz/core';

const FIELD_LABELS = {
  resume: 'RESUME.txt        (short summary)',
  readme: 'README.md         (full readme)',
  screenshots: 'screenshots/   (image folder)',
};

function ok(msg) { return `  \u001b[32m✔\u001b[0m ${msg}` }
function bad(msg) { return `  \u001b[31m✘\u001b[0m ${msg}` }
function warn(msg) { return `  \u001b[33m!\u001b[0m ${msg}` }
function info(msg) { return `  \u001b[90m·\u001b[0m ${msg}` }

export async function runValidate({ owner, repo, token, stdout, stderr }) {
  const client = new GitHubClient({ token, timeoutMs: 12000, retries: 1 });
  const builder = new CardBuilder(client);

  stdout.write(`Probing ${owner}/${repo} for a config-repodeck/ folder...\n\n`);

  let card;
  try {
    card = await builder.build(owner, repo, {
      include: { resume: true, readme: true, screenshots: true },
      branch: 'main',
      configPath: 'config-repodeck',
      token,
      timeoutMs: 12000,
      retries: 1,
    });
  } catch (err) {
    stderr.write(`\u001b[31mfatal:\u001b[0m ${err instanceof RepoDeckError ? err.message : String(err)}\n`);
    return 2;
  }

  let warnings = 0;
  const fields = ['resume', 'readme', 'screenshots'];
  for (const key of fields) {
    const value = card[key];
    if (value == null) {
      stdout.write(bad(`${FIELD_LABELS[key]} — missing`));
      stdout.write('\n');
      warnings++;
      continue;
    }
    if ('error' in value) {
      const e = value.error;
      const hint =
        e.code === 'NOT_FOUND' ? 'file not found' :
        e.code === 'RATE_LIMITED' ? 'GitHub API rate limit hit — set GITHUB_TOKEN for more' :
        e.code === 'UNAUTHORIZED' ? 'token invalid or expired' :
        e.code === 'NETWORK_ERROR' ? 'network error' :
        'unexpected error';
      stdout.write(bad(`${FIELD_LABELS[key]} — ${hint}\n        ${e.message}`));
      stdout.write('\n');
      warnings++;
      continue;
    }
    if (key === 'screenshots') {
      stdout.write(ok(`${FIELD_LABELS[key]} — ${value.length} image(s)`));
      stdout.write('\n');
      if (value.length === 0) {
        stdout.write(info('(the card will show a generated fallback cover)'));
        stdout.write('\n');
      }
    } else if (key === 'resume') {
      const len = value.text.length;
      const trunc = value.truncated ? ' (will be truncated at 280 chars on the card face)' : '';
      stdout.write(ok(`${FIELD_LABELS[key]} — ${len} chars${trunc}`));
      stdout.write('\n');
    } else {
      stdout.write(ok(`${FIELD_LABELS[key]} — ${value.html.length} chars of HTML`));
      stdout.write('\n');
      if (value.frontmatter && Object.keys(value.frontmatter).length) {
        stdout.write(info(`frontmatter: ${JSON.stringify(value.frontmatter)}`));
        stdout.write('\n');
      }
    }
  }

  stdout.write('\n');
  if (warnings === 0) {
    stdout.write(`\u001b[32m✔ config-repodeck/ looks healthy in ${owner}/${repo}.\u001b[0m\n`);
    return 0;
  }
  stdout.write(warn(`${warnings} issue${warnings === 1 ? '' : 's'} found — the card still works (missing fields are reported, not crashing the build).`));
  stdout.write('\n');
  return warnings === fields.length ? 2 : 0;
}
