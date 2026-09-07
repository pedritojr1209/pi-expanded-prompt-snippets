# pi-expanded-prompt-snippets

[![npm](https://img.shields.io/npm/v/pi-expanded-prompt-snippets)](https://www.npmjs.com/package/pi-expanded-prompt-snippets)
[![GitHub](https://img.shields.io/badge/GitHub-pi--expanded--prompt--snippets-blue)](https://github.com/pedritojr1209/pi-expanded-prompt-snippets)

Hierarchical prompt snippet and dynamic persona engine for the Pi coding agent.

Forked and expanded from Amos Blomqvist's original [`prompt-snippets`](https://github.com/amosblomqvist/pi-config).

## Core Capabilities

- **Recursive folder discovery** — snippets are loaded from `snippets/**/*.md` and `snippets/**/*.markdown`, supporting arbitrary nesting.
- **Interactive collapsible tree TUI** — open with `alt+s` or `/snippets` to browse, preview, and toggle snippets in a navigable tree.
- **Folder toggle with `main: true` header semantics** — a folder becomes toggleable when it contains a `main: true` snippet; enabling it injects a `## Folder Header` followed by `* Child Rule` bullets from all non-main siblings.
- **Structured prompt composition** — active snippets are merged into the outgoing message as prepend or append blocks, sorted by `order`.
- **Ephemeral per-turn steering** — toggles reset to all-off after each send and at session start; the active widget shows current steering and disappears on dispatch.

## Installation Guide

### Method 1: Global User Extensions (Recommended)

Clone directly into Pi's global extensions directory.

**Windows (PowerShell 7+)**

```powershell
git clone https://github.com/pedritojr1209/pi-expanded-prompt-snippets.git "$env:USERPROFILE\.pi\agent\extensions\pi-expanded-prompt-snippets"
```

**Linux / macOS**

```bash
git clone https://github.com/pedritojr1209/pi-expanded-prompt-snippets.git ~/.pi/agent/extensions/pi-expanded-prompt-snippets
```

### Method 2: Pi Configuration File (Global without moving files)

Add the absolute path to your `~/.pi/config.json`:

```json
{
  "extensions": ["G:/Pi-OS/projects/pi-expanded-prompt-snippets"]
}
```

Pi loads the extension from that path on startup.

### Method 3: Windows NTFS Junction (Best for development)

Create a junction from Pi's extensions folder to your dev checkout. Changes in the dev folder are reflected immediately without copying.

```powershell
$extensionName = "pi-expanded-prompt-snippets"
$piExtensions = "$env:USERPROFILE\.pi\agent\extensions"
$junctionPath = Join-Path $piExtensions $extensionName
$devTarget = "G:\Pi-OS\projects\pi-expanded-prompt-snippets"

if (-not (Test-Path -LiteralPath $junctionPath)) {
    New-Item -ItemType Junction -Path $junctionPath -Target $devTarget
    Write-Host "Junction created: $junctionPath -> $devTarget"
} else {
    Write-Host "Junction already exists: $junctionPath"
}
```

### Method 4: Project-Local Installation

Place the extension inside a target repo at `.pi/extensions/pi-expanded-prompt-snippets` so it is shared with everyone working on that project.

```bash
mkdir -p .pi/extensions && git clone https://github.com/pedritojr1209/pi-expanded-prompt-snippets.git .pi/extensions/pi-expanded-prompt-snippets
```

### Method 5: Ad-Hoc Runtime Flag (Zero install)

Launch Pi with the extension path passed directly:

```bash
pi --extension "G:\Pi-OS\projects\pi-expanded-prompt-snippets"
```

## Quickstart & Verification Demo

1. **Launch Pi** in a terminal.
2. Press **`Alt+S`** or run **`/snippets`** to open the toggle menu.
3. Navigate with **`Up`/`Down`**, press **`Space`** to toggle a demo snippet or an entire folder marked `main: true`.
4. Type a test prompt, for example:

   ```text
   Implement a debounce function in TypeScript.
   ```

5. Send the message. Observe:
   - The active widget above the editor disappears immediately (auto-reset).
   - The prompt sent to the model contains your text wrapped with the composed snippet blocks, e.g.:

     ```markdown
     ## Review
     * Check for injection vulnerabilities and unsafe input handling.

     Delegate mechanical work to subagents. Keep your own context window lean.

     Implement a debounce function in TypeScript.

     Ask questions until you are 100% sure you know exactly what to do.
     ```

## Keybindings Reference

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

## Directory Organization & `@role` Workflow

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
├── @orchestrator/
│   ├── main.md
│   └── plan-decompose.md
└── @binah/
    ├── main.md
    └── validator.md
```

- **Leaf files** are toggleable individually.
- **Folders** are toggleable only when they contain a snippet with `main: true`. Toggling a folder enables (or disables) that main snippet.
- Use `@`-prefixed folders to namespace role-based persona bundles (`@orchestrator`, `@binah`). Toggling a role folder activates the entire persona as a single composed block.

## Frontmatter Schema & Composition Output

Every snippet file is a Markdown document with an optional YAML frontmatter block at the top.

```markdown
---
name: Review
description: Review every public API for correctness and clarity.
placement: prepend
order: 10
main: true
---
Review every public API for correctness and clarity.
```

| Field | Required | Type | Notes |
|---|---|---|---|
| `name` | No | string | Display name in the toggle menu. Defaults to the filename stem. |
| `description` | No | string | Shown next to the name in the toggle menu. |
| `placement` | No | `prepend` \| `append` | `prepend` injects before the user message; `append` injects after. Default: `append`. |
| `order` | No | number | Sort key within the prepend or append group. Lower numbers come first. Default: `9999`. Ties are broken by snippet id. |
| `main` | No | boolean | When `true`, this snippet becomes the folder's toggle header. Exactly one `main` per folder is recommended; conflicts are resolved by lowest `order` then filesystem order. |

### Before-and-After Example

Given these active snippets:

- `snippets/review/main.md` (`placement: prepend`, `order: 10`, `main: true`)
- `snippets/review/security.md` (`placement: prepend`, `order: 5`)
- `snippets/orchestrator-mode.md` (`placement: prepend`, `order: 30`)
- `snippets/ask-questions.md` (`placement: append`, `order: 10`)

User sends:

```text
Refactor the auth module.
```

The extension produces the following transformed prompt:

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

## Development & Tests

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
