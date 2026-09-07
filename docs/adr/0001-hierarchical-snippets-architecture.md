# ADR 0001: Hierarchical Snippets Architecture

## Status
Accepted

## Context
The current extension discovers only flat `.md` files in `snippets/`. The expanded vision requires recursive directory traversal, cross-platform ID stability, folder-aware TUI interaction, and explicit composition rules.

## Decision
- **ID Normalization**: Relative paths from `snippets/` are normalized to POSIX forward slashes.
- **Extensions**: Both `.md` and `.markdown` are accepted.
- **TUI Structure**: Nested folders render as a collapsible tree. A folder toggle activates only the snippet with `main: true`; remaining snippets in that folder are individually toggleable.
- **Placement Default**: Missing or invalid `placement` defaults to `append`.
- **Ordering**: Active prepend snippets sorted by `order`, then user text, then active append snippets sorted by `order`.
- **Composition Format**: A folder's `main: true` snippet is injected as a Markdown header, with its active child snippets formatted as bullets underneath it.
- **Type Hygiene**: Ephemeral `node_modules/@earendil-works` mock typings are relocated to a tracked `types/` directory, containing only the minimal surface used by this extension.

## Consequences
- `loadSnippets` must replace flat `readdirSync` with recursive traversal.
- `parseSnippet` must accept a normalized relative path for ID derivation.
- `openMenu` must render collapsible folder nodes and handle `main: true` semantics.
- `input` handler must format folder mains as headers with bullet children.
- A tracked `types/` directory must be added and imported in place of `node_modules/@earendil-works`.
