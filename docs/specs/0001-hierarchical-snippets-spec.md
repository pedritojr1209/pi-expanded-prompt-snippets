# Spec 0001: Hierarchical Snippets

## Problem Statement

Users want to organize prompt snippets into nested folders, toggle entire categories at once, and control how grouped snippets compose into the final prompt. The current extension only scans a flat `snippets/` directory for `.md` files, shows a flat toggle list, and has no concept of folder-level defaults or grouping. This limits organization and makes managing large snippet libraries impractical.

## Solution

Replace the flat discovery model with recursive directory traversal, normalize IDs across platforms, render a collapsible tree in the TUI menu, and introduce `main: true` frontmatter so a folder can expose a single representative snippet while keeping its children as optional toggles. Snippet composition will format folder mains as Markdown headers with their active children as bullets. The minimal Pi/TUI typings will be moved from `node_modules` into a tracked `types/` directory.

## User Stories

1. As a user, I want snippets organized in nested subfolders, so that I can categorize them without flattening everything into one directory.
2. As a user, I want snippet IDs to stay stable across Windows and POSIX systems, so that my enabled toggles do not break when I switch machines.
3. As a user, I want `.markdown` files to be accepted in addition to `.md`, so that I am not forced into a single extension.
4. As a user, I want the toggle menu to show folders as collapsible tree nodes, so that I can browse hierarchy without losing context.
5. As a user, I want toggling a folder to activate only its `main: true` snippet, so that I can enable a category with one action while keeping extra variants optional.
6. As a user, I want each child snippet in a folder to remain individually toggleable, so that I can fine-tune the exact set of rules applied.
7. As a user, I want missing or invalid `placement` to default to `append`, so that legacy snippets continue to work without modification.
8. As a user, I want all active prepend snippets sorted by `order` before my message and all active append snippets sorted by `order` after my message, so that composition is predictable.
9. As a user, I want a folder's `main: true` snippet to render as a Markdown header with its active children as bullets, so that the prompt reads as structured prose.
10. As a user, I want typings for Pi and TUI to live in a tracked `types/` directory, so that the extension does not depend on ephemeral `node_modules` mock packages.
11. As a maintainer, I want the discovery engine to be unit-testable through a single seam, so that recursive traversal and ID normalization can be verified in isolation.
12. As a maintainer, I want the TUI tree state machine to be testable without a real terminal, so that expand/collapse and toggle behavior can be validated deterministically.
13. As a maintainer, I want the prompt transformer to be testable as a pure function, so that header/bullet formatting and global ordering are verified without running Pi.

## Implementation Decisions

- **Data Model**: `Snippet` will include `id` (POSIX-normalized relative path from `snippets/`), `filePath` (OS-native path), `name`, `placement` (`'prepend' | 'append'`), `order` (`number`), `main` (`boolean`), and `body` (`string`). `FolderNode` and `SnippetTreeNode` will represent the collapsible tree consumed by the TUI.
- **Discovery Engine**: `loadSnippets` will perform a recursive directory walk starting at `snippets/`, filter by `.md` and `.markdown` extensions, normalize relative paths to POSIX forward slashes for IDs, and parse frontmatter. Folder-level `main: true` validation will ensure at most one main snippet per folder; collisions will be resolved by lowest `order` or first discovered file.
- **Interactive TUI Tree Component**: The toggle menu will maintain `expandedFolders: Set<string>` and `enabled: Set<string>`. Render logic will use indentation plus `▸` / `▾` arrows and `[ ]` / `[x]` checkboxes. Keybindings will remain: arrow navigation, spacebar toggle, enter commit, escape cancel.
- **Prompt Transformer Hook**: Active snippets will be grouped by placement and globally sorted by `order`. A folder's `main: true` snippet will be emitted as a Markdown header, followed by bullets for each active child snippet in the same folder.
- **Type Hygiene**: A tracked `types/` directory will contain minimal stub declarations for `@earendil-works/pi-coding-agent` and `@earendil-works/pi-tui`. `tsconfig.json` will be updated to resolve these packages from `types/` instead of `node_modules/@earendil-works`.
- **Seams**: The highest existing seam is the boundary between `loadSnippets` and the TUI/prompt logic. New seams will be introduced at the tree-node factory and the prompt transformer, keeping the rest of the extension untouched.

## Testing Decisions

- **What to test**: External behavior only — discovery output, tree expansion/toggle state transitions, and final prompt text composition. Do not test private helper implementations or TUI rendering internals.
- **Modules under test**: `loadSnippets` (recursive traversal, extension filtering, ID normalization, `main: true` validation), tree-node factory (folder collapsing, selection state), prompt transformer (header/bullet formatting, global order sort).
- **Prior art**: Unit tests will follow the repo's existing test conventions. If no test runner is configured, tests will be added in a `tests/` directory using the project's established framework.

## Out of Scope

- Persistent storage of enabled snippets between sessions (still in-memory per session).
- Support for snippet formats beyond Markdown (`.txt`, `.json`, etc.).
- Remote or git-tracked snippet sources (local filesystem only).
- Renaming or reorganizing snippets via the TUI.
- Customizable keybindings or accessibility modes beyond the existing TUI key set.

## Further Notes

- The spec assumes the Pi extension API (`ExtensionAPI`, `ExtensionContext`) and TUI utilities (`Key`, `matchesKey`, `truncateToWidth`, `wrapTextWithAnsi`) remain stable as documented in the first-party extensions and TUI docs.
- Folder `main: true` snippets are optional; folders without a main snippet will simply expose their children as individual toggles without a header in the composed prompt.
