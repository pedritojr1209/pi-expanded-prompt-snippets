# Context

## Current State
- Extension entry point: `index.ts`
- Snippets live in `snippets/` next to `index.ts`
- Flat, non-recursive discovery; only `.md` files
- TUI toggle menu shows a flat list grouped by prepend/append
- Enabled snippets reset after each send and at session start

## Locked Decisions — Expanded Prompt Snippets
- IDs normalized to POSIX forward slashes
- Extensions: `.md` and `.markdown`
- Recursive discovery with collapsible tree in TUI
- Folder toggle activates `main: true` snippet; others remain leaf toggles
- Missing `placement` defaults to `append`
- Global order sort across active prepend then append groups
- `main: true` folder snippets inject as Markdown headers with bullet children
- Mock typings moved to tracked `types/` (minimal surface only)

## Domain Vocabulary
- **Snippet**: A single markdown file in `snippets/` with optional frontmatter.
- **Frontmatter**: YAML metadata block at the top of a snippet file (`name`, `description`, `placement`, `order`, `main`).
- **Placement**: Whether a snippet is injected before (`prepend`) or after (`append`) the user's message.
- **Order**: Numeric sort key within the prepend or append group.
- **Main snippet**: The snippet in a folder with `main: true` frontmatter; used as the folder's header when toggled.
- **Toggle menu**: The interactive TUI component opened by `alt+s` or `/snippets` for selecting active snippets.
- **Enabled snippets**: The set of snippet IDs currently toggled on; cleared after each send and at session start.
- **Widget**: The status line rendered above the editor showing active prepend/append snippets.
