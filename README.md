# pi-expanded-prompt-snippets

[![npm](https://img.shields.io/npm/v/pi-expanded-prompt-snippets)](https://www.npmjs.com/package/pi-expanded-prompt-snippets)
[![GitHub](https://img.shields.io/badge/GitHub-pi--expanded--prompt--snippets-blue)](https://github.com/pedritojr1209/pi-expanded-prompt-snippets)

Expanded hierarchical prompt snippet and dynamic persona engine for the Pi coding agent.

Forked from and based on Amos Blomqvist's original [prompt-snippets](https://github.com/amosblomqvist/pi-config).

## Core Features

- **Arbitrary folder hierarchy** — organize snippets into nested directories under `snippets/**/*.md` and `snippets/**/*.markdown`.
- **Interactive collapsible tree TUI** — open with `alt+s` or `/snippets` to browse, preview, and toggle snippets in a navigable tree.
- **Folder toggle with `main: true` header semantics** — marking a snippet as `main: true` makes its folder toggleable in the tree; enabling it injects a Markdown header plus bulleted child rules from all non-main siblings in that folder.
- **Automatic prompt composition** — active snippets are merged into the outgoing message as prepend or append blocks, sorted by `order`.
- **Ephemeral per-turn lifecycle** — toggles reset to all-off after each send and at session start, so snippets are always chosen intentionally.

## Installation

Choose the option that fits your workflow.

### Option 1: Git Clone into Pi User Extensions

Clone directly into Pi's global extensions directory.

**Windows (PowerShell 7+)**

```powershell
git clone https://github.com/pedritojr1209/pi-expanded-prompt-snippets.git "$env:USERPROFILE\.pi\agent\extensions\pi-expanded-prompt-snippets"
```

**Linux / macOS**

```bash
git clone https://github.com/pedritojr1209/pi-expanded-prompt-snippets.git ~/.pi/agent/extensions/pi-expanded-prompt-snippets
```

### Option 2: Local Development Link (Windows Junction)

Work on the extension in a separate folder and symlink it into Pi extensions using a NTFS junction. Changes in the dev folder are reflected immediately.

```powershell
# In your development folder (e.g. G:\Pi-OS\projects\pi-expanded-prompt-snippets)
$extensionName = "pi-expanded-prompt-snippets"
$piExtensions = "$env:USERPROFILE\.pi\agent\extensions"
$junctionPath = Join-Path $piExtensions $extensionName

if (-not (Test-Path -LiteralPath $junctionPath)) {
    New-Item -ItemType Junction -Path $junctionPath -Target (Get-Location)
    Write-Host "Junction created: $junctionPath -> $(Get-Location)"
} else {
    Write-Host "Junction already exists: $junctionPath"
}
```

### Option 3: Project-Level Installation

Clone the repo into a project's `.pi/extensions/` directory to share the extension with everyone working on that project.

```bash
mkdir -p .pi/extensions && git clone https://github.com/pedritojr1209/pi-expanded-prompt-snippets.git .pi/extensions/pi-expanded-prompt-snippets
```

## Interactive Controls & Keybindings

Open the snippet toggle menu with `alt+s` or the `/snippets` command.

| Key | Action |
|---|---|
| `alt+s` / `/snippets` | Open the snippet toggle menu |
| `Up` / `Down` | Navigate the tree |
| `Left` | Collapse the current folder |
| `Right` | Expand the current folder |
| `Space` | Toggle the current item |
| `Tab` | Preview the highlighted snippet (name, placement, order, id, and full body) |
| `Enter` | Apply selections and close |
| `Escape` | Cancel and close |

### Preview Mode

When you press `Tab` on a snippet or folder (with a `main: true` snippet), the menu switches to preview mode showing the snippet's full metadata and body. Use `Up`/`Down` to scroll long content. Press `Tab` or `Escape` to return to the list. Your cursor position is preserved across mode switches.

## Snippet Organization & Directory Layout

Snippets are discovered recursively from the `snippets/` directory next to `index.ts`. The collapsible tree in the TUI mirrors the folder structure exactly.

```
snippets/
├── ask-questions.md
├── delegate-exploration.md
├── diagnose-report.md
├── orchestrator-mode.md
├── session-kickoff.md
├── verify-not-assume.md
├── review/
│   ├── main.md              # main: true — toggles the whole folder
│   ├── security.md
│   └── style.md
└── @orchestrator/
    ├── main.md
    └── plan-decompose.md
```

- **Leaf files** are toggleable individually.
- **Folders** are toggleable only when they contain a snippet with `main: true`. Toggling a folder enables (or disables) that main snippet.
- Use `@`-prefixed folders to namespace role-based persona bundles.

## Frontmatter Specification

Every snippet file is a Markdown document with an optional YAML frontmatter block at the top.

```markdown
---
name: Concise
description: Keep answers short and to the point
placement: prepend
order: 10
main: true
---
Keep your response concise. Skip preamble and unnecessary explanation.
```

| Field | Required | Type | Notes |
|---|---|---|---|
| `name` | No | string | Display name in the toggle menu. Defaults to the filename stem. |
| `description` | No | string | Shown next to the name in the toggle menu. |
| `placement` | No | `prepend` \| `append` | `prepend` injects before the user message; `append` injects after. Default: `append`. |
| `order` | No | number | Sort key within the prepend or append group. Lower numbers come first. Default: `9999`. Ties are broken by snippet id. |
| `main` | No | boolean | When `true`, this snippet becomes the folder's toggle header. Exactly one `main` per folder is recommended; conflicts are resolved by lowest `order` then filesystem order. |

## Composition Example

Given the following files:

**`snippets/review/main.md`**
```markdown
---
name: Review
placement: prepend
order: 10
main: true
---
Review every public API for correctness and clarity.
```

**`snippets/review/security.md`**
```markdown
---
name: Security
placement: prepend
order: 5
---
Check for injection vulnerabilities and unsafe input handling.
```

**`snippets/orchestrator-mode.md`**
```markdown
---
name: Orchestrator mode
placement: prepend
order: 30
---
Delegate mechanical work to subagents. Keep your own context window lean.
```

**`snippets/ask-questions.md`**
```markdown
---
name: Ask questions
placement: append
order: 10
---
Ask questions until you are 100% sure you know exactly what to do.
```

If the user enables `review/main.md`, `orchestrator-mode.md`, and `ask-questions.md` and sends:

```text
Refactor the auth module.
```

The extension produces the following transformed text:

```markdown
## Review
* Check for injection vulnerabilities and unsafe input handling.

Delegate mechanical work to subagents. Keep your own context window lean.

Refactor the auth module.

Ask questions until you are 100% sure you know exactly what to do.
```

**Composition rules:**

1. **Prepend group** — active snippets with `placement: prepend` are sorted by `order` (ties broken by id), then joined with blank lines.
2. **User text** — inserted in the middle.
3. **Append group** — active snippets with `placement: append` are sorted by `order` (ties broken by id), then joined with blank lines after the user text.
4. **Folder `main` blocks** — when a `main: true` snippet is active, it generates a single block with a `## <name>` header followed by `* <body>` bullets for every non-main sibling in the same folder, sorted by `order`. The block's sort position is determined by the main snippet's `order`.

## Verification & Contributing

### Run Tests

```bash
npm test
```

The test suite covers discovery, tree building, prompt transformation, and end-to-end integration (71 tests).

### Typecheck

```bash
npm run typecheck
```

### Watch Mode

```bash
npm run test:watch
```

## Extension Contract

| Concept | Detail |
|---|---|
| Entry point | `index.ts` |
| Snippet directory | `snippets/` next to `index.ts` |
| Supported extensions | `.md`, `.markdown` |
| Hot reload | Snippets are re-scanned each time the menu opens and each time a message is sent. No `/reload` required. |
| Lifecycle | Enabled snippets reset after each send and at session start. |
| Widget | Active prepend/append snippets appear above the editor with accent/warning color coding. |
