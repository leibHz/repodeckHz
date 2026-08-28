/**
 * repodeck CLI — `init` command.
 *
 * Creates config-repodeck/ in the current working directory with starter
 * templates:
 *
 *   config-repodeck/
 *   ├── README.md       (frontmatter-friendly, with accordion-friendly sections)
 *   ├── RESUME.txt      (≤ 280 chars by default — comes pre-short)
 *   └── screenshots/.gitkeep
 *
 * Refuses to overwrite any existing file unless --force is passed.
 * Exits non-zero on I/O failure so CI catches it.
 */

import { mkdir, writeFile, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { constants as FsConstants } from 'node:fs';

const DEFAULT_CONFIG_DIR = 'config-repodeck';

function defaultReadme(repoName) {
  const safe = (repoName || 'your-repo').replace(/[^a-z0-9._-]/gi, '-');
  return `---
title: ${repoName || 'Your Project'}
description: One-line summary of the project.
order: 1
---

# ${repoName || 'Project Title'}

> Write the full README here — it shows up inside the card modal.

## What it does

One or two paragraphs describing the project.

## Tech

- Built with …
- Backed by …

## Running locally

\\\`\\\`\\\`bash
git clone https://github.com/<owner>/${safe}
cd ${safe}
# install + run steps
\\\`\\\`\\\`
`;
}

function defaultResume() {
  return `A short, plain-text summary the card shows on its face (max 280 chars).

Replace this with a one-line project pitch — what's the project, what problem it solves, and why someone would care.
`;
}

const GITKEEP = ''; // .gitkeep is empty by definition

async function exists(p) {
  try {
    await access(p, FsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function runInit({ cwd, force = false, repoName = 'your-repo', stdout, stderr }) {
  const target = resolve(cwd, DEFAULT_CONFIG_DIR);
  const alreadyExists = await exists(target);

  if (alreadyExists && !force) {
    stderr.write(`repodeck: ${DEFAULT_CONFIG_DIR}/ already exists in ${cwd}.\n`);
    stderr.write(`         pass --force to merge (existing files will not be overwritten).\n`);
    process.exitCode = 1;
    return;
  }

  await mkdir(join(target, 'screenshots'), { recursive: true });

  // Write only what is missing — with --force on an existing folder we merge
  // and never touch files that are already there.
  const candidates = [
    ['README.md', 'README.md', defaultReadme(repoName)],
    ['RESUME.txt', 'RESUME.txt', defaultResume()],
    ['screenshots/.gitkeep', join('screenshots', '.gitkeep'), GITKEEP],
  ];

  const created = [];
  for (const [label, rel, content] of candidates) {
    const p = join(target, rel);
    if (await exists(p)) continue;
    await writeFile(p, content, 'utf8');
    created.push(label);
  }

  if (alreadyExists) {
    if (created.length === 0) {
      stdout.write(`${DEFAULT_CONFIG_DIR}/ already complete — nothing to create (existing files are never overwritten).\n`);
    } else {
      stdout.write(`✔ Merged into existing ${DEFAULT_CONFIG_DIR}/\n`);
      for (const label of created) stdout.write(`  + ${label}\n`);
      stdout.write('  (existing files left untouched)\n');
    }
    return;
  }

  stdout.write(`✔ Created ${DEFAULT_CONFIG_DIR}/\n`);
  stdout.write('  ├── README.md\n');
  stdout.write('  ├── RESUME.txt\n');
  stdout.write(`  └── screenshots/\n\n`);
  stdout.write('Next steps:\n');
  stdout.write(`  1. Edit ${DEFAULT_CONFIG_DIR}/README.md — markdown, sanitised before rendering in the modal.\n`);
  stdout.write(`  2. Edit ${DEFAULT_CONFIG_DIR}/RESUME.txt — keep it under 280 chars; longer text is truncated.\n`);
  stdout.write(`  3. Drop project screenshots into ${DEFAULT_CONFIG_DIR}/screenshots/. Supported: png, jpg, jpeg, webp, gif, svg. They are sorted alphabetically.\n`);
  stdout.write(`  4. Commit and push. Then run:  npx repodeck validate <owner>/${repoName}\n`);
}
