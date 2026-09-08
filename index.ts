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

const dimText = (theme: any, text: string): string => {
	if (typeof theme?.dim === "function") return theme.dim(text);
	if (typeof theme?.fg === "function") return theme.fg("muted", text);
	return `\x1b[2m${text}\x1b[22m`;
};

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

				const snippet = snippets.find((s) => s.id === node.id);
				const order = snippet?.order ?? 9999;
				const placement = snippet?.placement ?? "append";
				const checkbox = row.enabled ? theme.fg("success", "[x]") : theme.fg("dim", "[ ]");
				const namePart = `${pointer}${indent}${branchPrefix}${checkbox} ${theme.bold(node.name)}`;
				const badgeText = `[#${order} · ${placement}]`;
				const dimmedBadge = dimText(theme,badgeText);
				const maxNameLen = width - badgeText.length;
				const displayName = maxNameLen > 0 ? truncateToWidth(namePart, maxNameLen) : "";
				const padding = Math.max(0, width - displayName.length - badgeText.length);
				return truncateToWidth(displayName + " ".repeat(padding) + dimmedBadge, width);
			};

			const buildRows = (width: number): string[] => {
				const visible = getVisibleRows(tree, state);
				return visible.map((r, i) => rowText(r, i, width));
			};

			const buildComposedPreviewRows = (width: number): string[] => {
				const active = snippets.filter((s) => state.enabled.has(s.id));
				const prepends = active
					.filter((s) => s.placement === "prepend")
					.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
				const appends = active
					.filter((s) => s.placement === "append")
					.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

				if (prepends.length === 0 && appends.length === 0) {
					return ["No active snippets"];
				}

				const rows: string[] = [];
				let index = 1;

				if (prepends.length > 0) {
					rows.push(theme.bold("[PREPEND]"));
					for (const snippet of prepends) {
						rows.push(truncateToWidth(`${index}. [${snippet.order}] ${snippet.id}`, width));
						const firstLine = snippet.body.split("\n")[0] ?? "";
						const bodyWidth = Math.max(0, width - 4);
						for (const wrapped of wrapTextWithAnsi(firstLine, bodyWidth)) {
							rows.push(truncateToWidth("    " + dimText(theme,wrapped), width));
						}
						rows.push("");
						index++;
					}
				}

				const userMsgLabel = " [USER MESSAGE] ";
				const totalDashLen = Math.max(3, width - userMsgLabel.length);
				const leftDashLen = Math.floor(totalDashLen / 2);
				const rightDashLen = totalDashLen - leftDashLen;
				rows.push(theme.fg("dim", "─".repeat(leftDashLen) + userMsgLabel + "─".repeat(rightDashLen)));

				if (appends.length > 0) {
					rows.push(theme.bold("[APPEND]"));
					for (const snippet of appends) {
						rows.push(truncateToWidth(`${index}. [${snippet.order}] ${snippet.id}`, width));
						const firstLine = snippet.body.split("\n")[0] ?? "";
						const bodyWidth = Math.max(0, width - 4);
						for (const wrapped of wrapTextWithAnsi(firstLine, bodyWidth)) {
							rows.push(truncateToWidth("    " + dimText(theme,wrapped), width));
						}
						rows.push("");
						index++;
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

			let mode: "tree" | "preview" = "tree";

			return {
				render(width: number): string[] {
					const maxView = Math.max(5, tui.terminal.rows - 10);

					let content: string[];
					let title: string;
					let hints: string;
					if (mode === "tree") {
						const rows = buildRows(width);
						const v = viewport(rows, 0, maxView, state.cursor);
						content = v.out;
						title = "Prompt snippets";
						hints = "↑↓ navigate • Space toggle • ←→ collapse/expand • p preview • Enter apply • Esc cancel";
					} else {
						const previewRows = buildComposedPreviewRows(width);
						const v = viewport(previewRows, previewScroll, maxView);
						content = v.out;
						previewScroll = v.scroll;
						title = "Composed Prompt Preview (Order Verified)";
						hints = "p or Esc back to tree • ↑↓ scroll • Enter apply selection";
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
					if (mode === "tree") {
						if (matchesKey(data, Key.up)) {
							state = moveCursor(tree, state, "up");
							tui.requestRender();
						} else if (matchesKey(data, Key.down)) {
							state = moveCursor(tree, state, "down");
							tui.requestRender();
						} else if (matchesKey(data, Key.space)) {
							const visible = getVisibleRows(tree, state);
							const row = visible[state.cursor];
							if (row) {
								state = toggleSelection(tree, state, row.node.id);
							}
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
						} else if (matchesKey(data, "p")) {
							mode = "preview";
							previewScroll = 0;
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
						} else if (matchesKey(data, "p") || matchesKey(data, Key.escape)) {
							mode = "tree";
							tui.requestRender();
						} else if (matchesKey(data, Key.enter)) {
							done(true);
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
