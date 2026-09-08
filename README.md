# pi-expanded-prompt-snippets

[![npm](https://img.shields.io/npm/v/pi-expanded-prompt-snippets)](https://www.npmjs.com/package/pi-expanded-prompt-snippets)
[![GitHub](https://img.shields.io/badge/GitHub-pi--expanded--prompt--snippets-blue)](https://github.com/pedritojr1209/pi-expanded-prompt-snippets)

Advanced hierarchical prompt snippet, dynamic persona dispatch, and ephemeral steering engine for the Pi coding agent.

Original attribution to Amos Blomqvist's [`prompt-snippets`](https://github.com/amosblomqvist/pi-config).

## Key Features

- **Arbitrary recursive directory tree** — snippets are discovered from `snippets/**/*.md` and `snippets/**/*.markdown`, supporting unlimited nesting depth.
- **Interactive TUI Tree Menu** — open with `alt+s` or `/snippets` to browse, preview, and toggle snippets in a navigable tree.
- **Order Badges visible in the tree** — displays resolved `[#<order> · <placement>]` next to each snippet row (defaults to `#9999`).
- **Full Composed Prompt Preview via `p`** — full-screen order verification view showing exact assembled text before sending.
- **Smart Spacebar Interaction** — toggling a folder auto-expands it and activates `main: true`; unchecking auto-collapses it and cleans up all active child snippets.
- **Pure Markdown Freedom** — no forced `##` title headers and no forced `* ` bullet points—emits raw snippet bodies separated by double newlines.
- **Ephemeral Turn Lifecycle** — active status widget above the editor, automatically resets after message dispatch and on session start.

## Installation Matrix

### Method 1: Global User Extension (`~/.pi/agent/extensions/`)

Clone directly into Pi's global extensions directory.

**Windows (PowerShell 7+)**

```powershell
git clone https://github.com/pedritojr1209/pi-expanded-prompt-snippets.git "$env:USERPROFILE\.pi\agent\extensions\pi-expanded-prompt-snippets"
```

**Linux / macOS**

```bash
git clone https://github.com/pedritojr1209/pi-expanded-prompt-snippets.git ~/.pi/agent/extensions/pi-expanded-prompt-snippets
```

### Method 2: Global via `config.json`

Add the absolute path to your `~/.pi/config.json`:

```json
{
  "extensions": ["G:/Pi-OS/projects/pi-expanded-prompt-snippets"]
}
```

Pi loads the extension from that path on startup.

### Method 3: Windows NTFS Junction (Best for active development)

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

### Method 4: Project-Local (`.pi/extensions/`)

Place the extension inside a target repo at `.pi/extensions/pi-expanded-prompt-snippets` so it is shared with everyone working on that project.

```bash
mkdir -p .pi/extensions && git clone https://github.com/pedritojr1209/pi-expanded-prompt-snippets.git .pi/extensions/pi-expanded-prompt-snippets
```

### Method 5: Ad-Hoc CLI Flag (`pi --extension ...`)

Launch Pi with the extension path passed directly:

```bash
pi --extension "G:\Pi-OS\projects\pi-expanded-prompt-snippets"
```

## Keybindings Reference

| Key | Action |
|---|---|
| `Alt+S` / `/snippets` | Open toggle menu |
| `Up` / `Down` | Navigate rows (or scroll in preview mode) |
| `Space` | Toggle snippet / Folder toggle (auto-expands on enable, cleans & collapses on disable) |
| `p` | Toggle Full Composed Prompt Preview mode |
| `Left` / `Right` | Collapse / Expand folder manually |
| `Enter` | Confirm and apply selection |
| `Escape` | Cancel / dismiss menu (or return from preview to tree) |

## Frontmatter Reference & How `order` Works

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

### How `order` Works

The final composed prompt has three zones:

1. **Prepend Zone** — active snippets with `placement: prepend`, sorted by `order` ascending (ties broken by snippet id), joined by double newlines.
2. **User Message** — inserted in the middle, separated by double newlines from both sides.
3. **Append Zone** — active snippets with `placement: append`, sorted by `order` ascending (ties broken by snippet id), joined by double newlines after the user message.

**Default behavior:** When a snippet has no explicit `order`, it defaults to `#9999`. This pushes it to the end of its placement group.

**Alphabetical tiebreaks:** When two snippets share the same `order`, they are ordered by their snippet id (alphabetical / filesystem order).

## Composition Output

Active snippets are merged into the outgoing message as prepend or append blocks, sorted by `order`.

```markdown
[PREPEND ZONE — sorted by order]
Body of prepend snippet A.
Body of prepend snippet B.

[USER MESSAGE]
Your actual message here.

[APPEND ZONE — sorted by order]
Body of append snippet C.
Body of append snippet D.
```

## Directory Organization

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

## Verified Interactions

| Behavior | Verified |
|---|---|
| Toggle menu opens via `alt+s` and `/snippets` | Yes |
| Space toggles folder with `main: true` and auto-expands | Yes |
| Unchecking folder collapses and cleans all active children | Yes |
| Order badges `[#<order> · <placement>]` render next to snippets | Yes |
| Full Composed Prompt Preview (`p`) shows ordered prepend/append zones | Yes |
| Preview returns to tree via `p` or `Escape` | Yes |
| Ephemeral widget shows active prepend/append above editor | Yes |
| Widget clears automatically after send and on session start | Yes |
| Pure markdown bodies joined by double newlines (no forced headers/bullets) | Yes |

## Development & Tests

### Run Tests

```bash
npm test
```

The test suite covers discovery, tree building, prompt transformation, and end-to-end integration.

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
