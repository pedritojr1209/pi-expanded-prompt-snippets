# Prompt Snippets Extension — Architecture Research

**Repo:** `G:\Pi-OS\projects\pi-expanded-prompt-snippets`  
**Sources analyzed:** local `index.ts`, local `README.md`, primary Pi docs at `https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md`, Pi TUI docs at `https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/tui.md`, and first-party examples (`input-transform.ts`).

---

## 1. Module & Import Signature

### Node built-ins
`index.ts:18-20` imports three Node built-in modules:

```ts
import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
```

This is consistent with the Pi docs which list `node:fs`, `node:path`, etc. as available built-ins ([`extensions.md`](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md)).

### Pi extension types
`index.ts:21` imports the Pi extension type contract:

```ts
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
```

The official docs confirm this package supplies `ExtensionAPI`, `ExtensionContext`, and event typings ([`extensions.md`](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md)).

### External npm packages (Pi TUI)
`index.ts:22` pulls TUI rendering utilities:

```ts
import { Key, matchesKey, truncateToWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
```

The TUI docs confirm these are first-party exports from `@earendil-works/pi-tui` ([`tui.md`](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/tui.md)).

### Default export / Pi loading signature
`index.ts:82` exports the factory function Pi invokes:

```ts
export default function (pi: ExtensionAPI) {
  // ...
}
```

Pi discovers this as either a single-file extension (`*.ts`) or a directory containing `index.ts`, then calls the default export with the API object ([`extensions.md`](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md)). The local extension lives alongside a `snippets/` subdirectory, matching the “Directory with index.ts” layout.

---

## 2. Snippet Discovery & Storage

### Snippets folder location
`index.ts:34-35` resolves the snippets directory relative to the extension entry point:

```ts
const extensionDir = dirname(fileURLToPath(import.meta.url));
const snippetsDir = join(extensionDir, "snippets");
```

Pi provides `import.meta.url` in extensions loaded via jiti, so `dirname(fileURLToPath(import.meta.url))` yields the directory containing `index.ts`. The `README.md:27` explicitly states: *“Snippets live in `snippets/` next to `index.ts`”*.

### File extensions scanned
`index.ts:66-67` limits discovery to Markdown only:

```ts
for (const file of readdirSync(snippetsDir)) {
  if (!file.toLowerCase().endsWith(".md")) continue;
```

No `.txt`, `.json`, or other extensions are processed.

### Snippet parsing
`index.ts:38-60` defines `parseSnippet`, which uses a regex to extract YAML frontmatter delimited by `---` fences:

```ts
const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
```

It then lowercases keys and strips quotes:

```ts
const kv = line.match(/^([A-Za-z][\w-]*)\s*:\s*(.*)$/);
if (kv) meta[kv[1].toLowerCase()] = kv[2].trim().replace(/^["']|["']$/g, "");
```

Title defaults to the filename without `.md` (`index.ts:54`):

```ts
name: meta.name || filename.replace(/\.md$/i, ""),
```

Body is everything after the closing fence (`index.ts:48`):

```ts
const body = match[2].trim();
```

---

## 3. UI & Interaction Flow

### Trigger mechanisms
Two entry points are registered:

1. **Shortcut** — `index.ts:312-317`:
   ```ts
   pi.registerShortcut("alt+s", {
     description: "Toggle prompt snippets",
     handler: async (ctx) => {
       await openMenu(ctx);
     },
   });
   ```

2. **Slash command** — `index.ts:319-324`:
   ```ts
   pi.registerCommand("snippets", {
     description: "Open the prompt snippet toggle menu",
     handler: async (_args, ctx) => {
       await openMenu(ctx);
     },
   });
   ```

This matches the README: *“Press alt+s or run /snippets to open the toggle menu”* (`README.md:9`).

### Menu implementation
`openMenu` (`index.ts:110-285`) builds a custom TUI component via `ctx.ui.custom<boolean>`. The factory signature conforms to the first-party spec: `(tui, theme, _keybindings, done)` ([`tui.md`](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/tui.md)).

Navigation is handled with `matchesKey` from `@earendil-works/pi-tui`:

```ts
if (matchesKey(data, Key.up)) { ... }
else if (matchesKey(data, Key.space)) {
  const id = items[cursor].id;
  if (working.has(id)) working.delete(id);
  else working.add(id);
  tui.requestRender();
}
```

### Enabled state tracking
`index.ts:86` tracks toggles:

```ts
let enabled = new Set<string>();
```

`openMenu` clones this into a working set (`index.ts:127`):

```ts
const working = new Set(enabled);
```

On Enter (`index.ts:260-261`), `done(true)` resolves the promise. The caller then commits (`index.ts:281-282`):

```ts
if (confirmed) {
  enabled = working;
}
```

### Active widget
`updateWidget` (`index.ts:88-108`) renders the active snippets above the editor using `ctx.ui.setWidget`:

```ts
ctx.ui.setWidget(WIDGET_ID, lines);
```

Widget is cleared when no snippets are active (`index.ts:95`):

```ts
ctx.ui.setWidget(WIDGET_ID, undefined);
```

---

## 4. Injection & Reset Lifecycle

### Prompt injection hook
`index.ts:294-310` listens to the `input` event, which Pi fires after extension commands are checked but before skill/template expansion ([`extensions.md`](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md#input)):

```ts
pi.on("input", async (event, ctx) => {
  if (enabled.size === 0) return; // continue unchanged

  snippets = loadSnippets();
  const active = snippets.filter((s) => enabled.has(s.id));
  enabled = new Set();
  updateWidget(ctx);

  if (active.length === 0) return;

  const prependBodies = active.filter((s) => s.placement === "prepend").map((s) => s.body);
  const appendBodies = active.filter((s) => s.placement === "append").map((s) => s.body);
  return {
    action: "transform",
    text: [...prependBodies, event.text, ...appendBodies].join("\n\n"),
  };
});
```

This returns `{ action: "transform", text: ... }`, which Pi processes per the documented `input` event contract: transforms chain across handlers and then continue to expansion ([`extensions.md`](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md#input)). The official `input-transform.ts` example uses the identical return shape.

### Automatic reset / clear
Reset occurs in two places:

1. **After send** — `index.ts:299`:
   ```ts
   enabled = new Set();
   ```

2. **On session start** — `index.ts:287-289`:
   ```ts
   pi.on("session_start", (_event, ctx) => {
     enabled = new Set();
     snippets = loadSnippets();
   ```

There is no persistent storage of enabled snippets between sends or sessions; they are purely in-memory for the duration of a single turn.

---

## 5. Gaps for the “Expanded” Vision

### Flat folder assumption
`loadSnippets` (`index.ts:63-80`) uses a non-recursive `readdirSync`:

```ts
for (const file of readdirSync(snippetsDir)) {
```

This only discovers files directly inside `snippets/`. Any nested directory structure is ignored.

### Missing recursion / subfolder support
To support recursive/arbitrary subfolders, the following changes are needed:

- Replace `readdirSync(snippetsDir)` with a recursive walk (e.g., `readdirSync(snippetsDir, { recursive: true })` or a manual depth-first traversal).
- Preserve the relative path from `snippets/` so each file still has a unique `id`. Currently `id` is the filename (`index.ts:53`):
  ```ts
  id: filename,
  ```
  A recursive walk would need to assign `id` values like `subfolder/name.md` or derive hierarchical IDs.
- Decide how subfolders map to `placement` and `order`. Currently these are per-file frontmatter fields (`index.ts:29-30`). An expanded vision could:
  - Keep per-file frontmatter but allow folder-level defaults (e.g., every file in `snippets/prepend/` defaults to `placement: "prepend"` unless overridden).
  - Or require explicit frontmatter in every file and simply collect them recursively.

### `prepend` / `append` positioning readiness
The data model already supports both placements (`index.ts:29`), and `loadSnippets` sorts them into prepend-first, append-last groups (`index.ts:76-79`). The `input` handler already splits bodies by placement before joining (`index.ts:304-305`). Therefore, the injection logic is ready for arbitrary snippet sources; the only gap is **discovery scope** (flat vs. recursive).

### What would need to change in code
1. **`loadSnippets`** — replace `readdirSync` loop with a recursive directory traversal.
2. **`parseSnippet`** — optionally accept a relative path or folder-based namespace to derive display names or IDs.
3. **`README.md`** — document whether folder hierarchy implies default `placement` or grouping.
4. **`openMenu` / `buildListRows`** — if folders are meant to be shown as collapsible groups, the UI would need folder headers; otherwise a flat sorted list still works if discovery is recursive.
