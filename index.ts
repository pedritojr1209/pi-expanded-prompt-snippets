/**
 * Prompt Snippets — mix-and-match single-purpose prompt rules.
 *
 * Each snippet is a markdown file with frontmatter (name, description,
 * placement, order) stored in the `snippets/` directory next to this file.
 *
 * - Press alt+s or run /snippets to open the toggle menu (space: toggle,
 *   arrows: navigate, left/right: collapse/expand, enter: apply, esc: cancel).
 * - Active snippets appear as a widget above the editor, with prepend and
 *   append groups visually distinguished.
 * - When a message is sent, active snippet bodies are composed via the prompt
 *   transformer and injected around the message text.
 * - Toggles reset to all-off after each send and at session start.
 */

import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { Snippet } from "./types/snippet.js";
import { Key, matchesKey, truncateToWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { loadSnippets } from "./src/discovery.js";
import { composePrompt } from "./src/transformer.js";
import {
	buildTree,
	createInitialState,
	getVisibleRows,
	type TreeNode,
	type TreeRow,
	toggleExpandCollapse,
	toggleSelection,
	moveCursor,
} from "./src/tree.js";

const extensionDir = dirname(fileURLToPath(import.meta.url));
const snippetsDir = join(extensionDir, "snippets");
const WIDGET_ID = "prompt-snippets";

export default function (pi: ExtensionAPI) {
	let snippets: Snippet[] = [];
	let enabled = new Set<string>();

	function updateWidget(ctx: ExtensionContext) {
		if (!ctx.hasUI || ctx.mode !== "tui") return;
		const active = snippets.filter((s) => enabled.has(s.id));
		const prepends = active.filter((s) => s.placement === "prepend");
		const appends = active.filter((s) => s.placement === "append");

		if (prepends.length === 0 && appends.length === 0) {
			ctx.ui.setWidget(WIDGET_ID, undefined);
			return;
		}

		const theme = ctx.ui.theme;
		const lines: string[] = [];
		if (prepends.length > 0) {
			lines.push(theme.fg("accent", `↑ prepend: ${prepends.map((s) => s.name).join(" · ")}`));
		}
		if (appends.length > 0) {
			lines.push(theme.fg("warning", `↓ append: ${appends.map((s) => s.name).join(" · ")}`));
		}
		ctx.ui.setWidget(WIDGET_ID, lines);
	}

	async function openMenu(ctx: ExtensionContext) {
		if (ctx.mode !== "tui") {
			ctx.ui.notify("Snippet menu requires interactive mode", "warning");
			return;
		}

		snippets = loadSnippets(snippetsDir);
		enabled = new Set([...enabled].filter((id) => snippets.some((s) => s.id === id)));

		if (snippets.length === 0) {
			ctx.ui.notify(`No snippets found in ${snippetsDir}`, "warning");
			updateWidget(ctx);
			return;
		}

		const tree = buildTree(snippets);
		let state = createInitialState(tree);

		const confirmed = await ctx.ui.custom<boolean>((tui, theme, _keybindings, done) => {
			let previewScroll = 0;

			const rowText = (row: TreeRow, index: number, width: number): string => {
				const pointer = index === state.cursor ? theme.fg("accent", "> ") : "  ";
				const indent = "  ".repeat(row.depth);
				const node = row.node;
				const branchPrefix = row.depth > 0 ? (row.isLast ? "└── " : "├── ") : "";

				if (node.type === "folder") {
					const arrow = row.expanded ? theme.fg("dim", "▾") : theme.fg("dim", "▸");
					const checked = row.enabled ? theme.fg("success", "[x]") : theme.fg("dim", "[ ]");
					return truncateToWidth(`${pointer}${indent}${branchPrefix}${arrow} ${checked} ${theme.bold(node.name)}`, width);
				}

				const checkbox = row.enabled ? theme.fg("success", "[x]") : theme.fg("dim", "[ ]");
				return truncateToWidth(`${pointer}${indent}${branchPrefix}${checkbox} ${theme.bold(node.name)}`, width);
			};

			const buildRows = (width: number): string[] => {
				const visible = getVisibleRows(tree, state);
				return visible.map((r, i) => rowText(r, i, width));
			};

			const buildPreviewRows = (snippet: Snippet, width: number): string[] => {
				const rows: string[] = [];
				rows.push(truncateToWidth(theme.bold(snippet.name), width));
				rows.push(truncateToWidth(theme.fg("dim", `${snippet.placement} · order ${snippet.order} · ${snippet.id}`), width));
				rows.push(theme.fg("dim", "─".repeat(Math.min(width, 40))));
				for (const line of snippet.body.split("\n")) {
					for (const wrapped of wrapTextWithAnsi(line, width)) {
						rows.push(truncateToWidth(wrapped, width));
					}
				}
				return rows;
			};

			const viewport = (
				lines: string[],
				scroll: number,
				maxView: number,
				focusRow?: number,
			): { out: string[]; scroll: number } => {
				const clipped = lines.length > maxView;
				const view = clipped ? Math.max(1, maxView - 2) : maxView;

				let s = Math.min(Math.max(0, scroll), Math.max(0, lines.length - view));
				if (focusRow !== undefined) {
					if (focusRow < s) s = focusRow;
					else if (focusRow >= s + view) s = focusRow - view + 1;
				}

				const visible = lines.slice(s, s + view);
				if (!clipped) return { out: visible, scroll: s };

				const above = s;
				const below = lines.length - (s + view);
				return {
					out: [
						above > 0 ? theme.fg("dim", `  ↑ ${above} more`) : "",
						...visible,
						below > 0 ? theme.fg("dim", `  ↓ ${below} more`) : "",
					],
					scroll: s,
				};
			};

			let mode: "list" | "preview" = "list";
			let previewSnippet: Snippet | null = null;

			return {
				render(width: number): string[] {
					const maxView = Math.max(5, tui.terminal.rows - 10);

					let content: string[];
					let title: string;
					let hints: string;
					if (mode === "list") {
						const rows = buildRows(width);
						const v = viewport(rows, 0, maxView, state.cursor);
						content = v.out;
						title = "Prompt snippets";
						hints = "↑↓ navigate • Space toggle • ←→ collapse/expand • Enter apply • Esc cancel";
					} else {
						if (!previewSnippet) {
							const visible = getVisibleRows(tree, state);
							const row = visible[state.cursor];
							if (row && row.node.type === "snippet") {
								previewSnippet = snippets.find((s) => s.id === row.node.id) ?? null;
							} else if (row && row.node.type === "folder") {
								const folderNode = row.node;
								if (folderNode.mainSnippetId) {
									previewSnippet = snippets.find((s) => s.id === folderNode.mainSnippetId) ?? null;
								}
							}
						}
						const previewRows = previewSnippet ? buildPreviewRows(previewSnippet, width) : ["No snippet selected"];
						const v = viewport(previewRows, previewScroll, maxView);
						content = v.out;
						previewScroll = v.scroll;
						title = previewSnippet ? `Preview: ${previewSnippet.name}` : "Preview";
						hints = "↑↓ scroll • Tab/Esc back";
					}

					return [
						theme.fg("accent", "─".repeat(width)),
						truncateToWidth(` ${theme.fg("accent", theme.bold(title))}`, width),
						"",
						...content,
						"",
						truncateToWidth(theme.fg("dim", ` ${hints}`), width),
						theme.fg("accent", "─".repeat(width)),
					];
				},
				invalidate() {},
				handleInput(data: string) {
					if (mode === "list") {
						if (matchesKey(data, Key.up)) {
							state = moveCursor(tree, state, "up");
							previewSnippet = null;
							tui.requestRender();
						} else if (matchesKey(data, Key.down)) {
							state = moveCursor(tree, state, "down");
							previewSnippet = null;
							tui.requestRender();
						} else if (matchesKey(data, Key.space)) {
							const visible = getVisibleRows(tree, state);
							const row = visible[state.cursor];
							if (row) {
								const nodeId = row.node.type === "folder" && row.node.mainSnippetId
									? row.node.mainSnippetId
									: row.node.id;
								state = toggleSelection(tree, state, nodeId);
							}
							previewSnippet = null;
							tui.requestRender();
						} else if (matchesKey(data, Key.left)) {
							const visible = getVisibleRows(tree, state);
							const row = visible[state.cursor];
							if (row && row.node.type === "folder" && row.expanded) {
								state = toggleExpandCollapse(tree, state, row.node.id);
							}
							tui.requestRender();
						} else if (matchesKey(data, Key.right)) {
							const visible = getVisibleRows(tree, state);
							const row = visible[state.cursor];
							if (row && row.node.type === "folder" && !row.expanded) {
								state = toggleExpandCollapse(tree, state, row.node.id);
							}
							tui.requestRender();
						} else if (matchesKey(data, Key.tab)) {
							mode = "preview";
							previewScroll = 0;
							previewSnippet = null;
							tui.requestRender();
						} else if (matchesKey(data, Key.enter)) {
							done(true);
						} else if (matchesKey(data, Key.escape)) {
							done(false);
						}
					} else {
						if (matchesKey(data, Key.up)) {
							previewScroll--;
							tui.requestRender();
						} else if (matchesKey(data, Key.down)) {
							previewScroll++;
							tui.requestRender();
						} else if (matchesKey(data, Key.tab) || matchesKey(data, Key.escape)) {
							mode = "list";
							tui.requestRender();
						}
					}
				},
			};
		});

		if (confirmed) {
			enabled = state.enabled;
		}
		updateWidget(ctx);
	}

	pi.on("session_start", (_event, ctx) => {
		enabled = new Set();
		snippets = loadSnippets(snippetsDir);
		if (!existsSync(snippetsDir)) mkdirSync(snippetsDir, { recursive: true });
		updateWidget(ctx);
	});

	pi.on("input", async (event, ctx) => {
		if (enabled.size === 0) return;

		snippets = loadSnippets(snippetsDir);
		const active = snippets.filter((s) => enabled.has(s.id));
		enabled = new Set();
		updateWidget(ctx);

		if (active.length === 0) return;

		return {
			action: "transform",
			text: composePrompt(event.text, active),
		};
	});

	pi.registerShortcut("alt+s", {
		description: "Toggle prompt snippets",
		handler: async (ctx) => {
			await openMenu(ctx);
		},
	});

	pi.registerCommand("snippets", {
		description: "Open the prompt snippet toggle menu",
		handler: async (_args, ctx) => {
			await openMenu(ctx);
		},
	});
}
