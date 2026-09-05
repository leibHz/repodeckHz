# `repodeck` CLI

Two commands ship in the main `@repodeckhz/web` package, no separate
install needed if you already use the web component.

## `repodeck init`

Generates a `config-repodeck/` folder in the current working
directory with starter templates.

```sh
npx repodeck init
# ✔ Created config-repodeck/
#   ├── README.md
#   ├── RESUME.txt
#   └── screenshots/
#
# Next steps:
#   1. Edit config-repodeck/README.md — markdown, sanitised before rendering in the modal.
#   2. Edit config-repodeck/RESUME.txt — keep it under 280 chars; longer text is truncated.
#   3. Drop project screenshots into config-repodeck/screenshots/. Supported: png, jpg, jpeg, webp, gif, svg.
#   4. Commit and push. Then run:  npx repodeck validate <owner>/<repo>
```

Flags:

| Flag                | Effect                                                       |
|---------------------|--------------------------------------------------------------|
| `--repo <name>`     | Pre-fills the README template's name placeholder.            |
| `--force`           | Merges into an existing `config-repodeck/` folder, creating only the missing files. Existing files are never overwritten. |

If the folder already exists and `--force` is not passed, `init` exits
non-zero without modifying anything. With `--force`:

```sh
npx repodeck init --force
# ✔ Merged into existing config-repodeck/
#   + RESUME.txt
#   (existing files left untouched)
```

If there is nothing missing, it prints that the folder is already complete
and exits `0`.

## `repodeck validate <owner>/<repo>`

Probes a public GitHub repository for a `config-repodeck/` folder
and prints a field-by-field report. Reuses `@repodeckhz/core`'s
`CardBuilder` so what you see is exactly what the card would see.

```sh
npx repodeck validate facebook/react
# Probing facebook/react for a config-repodeck/ folder...
#
#   ✘ RESUME.txt        (short summary)   — file not found
#       RESUME.txt not found in config folder.
#   ✘ README.md         (full readme)     — file not found
#       README.md not found in config folder.
#   ✔ screenshots/   (image folder) — 0 image(s)
#       (the card will show a generated fallback cover)
#
#   ! 2 issues found — the card still works (missing fields are reported, not crashing the build).
```

Use `GITHUB_TOKEN` (or `GH_TOKEN`) to raise the request budget for
private repos or to keep the public limit comfortable:

```sh
GITHUB_TOKEN=ghp_xxx npx repodeck validate my-org/private-repo
```

### Exit codes

| Code | Meaning                                                                                     |
|------|---------------------------------------------------------------------------------------------|
| `0`  | All fields healthy, or partial issues (some files missing/broken) but no fatal failure.    |
| `1`  | Validation couldn't start (no folder already exists in `init`, bad CLI arguments, etc.).    |
| `2`  | Fatal fetch failure (network error, 5xx without retry, repository not found).              |

`validate` exits 0 when there are partial issues so you can run it
on every push without failing the workflow. The exit code 2 case is
reserved for genuine trouble reaching GitHub or finding the repo.

## `repodeck help`

```
Usage:
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
```

## Common recipes

### Pre-commit hook

Run `validate` against your own repo before pushing:

```jsonc
// package.json (in the showcased repo)
{
  "scripts": {
    "prepush": "npx repodeck validate $(node -p \"require('./package.json').repository.split(':').pop().replace('.git','')\")"
  }
}
```

### CI

```yaml
- name: Validate config folder
  run: npx repodeck validate ${{ github.repository }}
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Next

- [The `config-repodeck/` folder](../config-folder.md) for the
  file-format reference.
