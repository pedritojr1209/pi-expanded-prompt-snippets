import type { Snippet } from "../types/snippet.js";

const DEFAULT_ORDER = 9999;

function getOrder(snippet: Snippet): number {
	return Number.isFinite(snippet.order) ? snippet.order : DEFAULT_ORDER;
}

function folderOf(snippet: Snippet): string {
	const id = snippet.id.replace(/\\/g, "/");
	const lastSlash = id.lastIndexOf("/");
	if (lastSlash === -1) return "";
	return id.slice(0, lastSlash);
}

interface Block {
	readonly text: string;
	readonly order: number;
	readonly id: string;
}

function buildBlocks(snippets: Snippet[]): Block[] {
	const byFolder = new Map<string, Snippet[]>();
	for (const snippet of snippets) {
		const folder = folderOf(snippet);
		const existing = byFolder.get(folder) ?? [];
		existing.push(snippet);
		byFolder.set(folder, existing);
	}

	const blocks: Block[] = [];
	for (const [, folderSnippets] of byFolder) {
		const main = folderSnippets.find((s) => s.main);
		if (main) {
			const children = folderSnippets
				.filter((s) => !s.main)
				.sort((a, b) => getOrder(a) - getOrder(b) || a.id.localeCompare(b.id));
			const lines: string[] = [main.body.trim()];
			for (const child of children) {
				lines.push(`* ${child.body.trim()}`);
			}
			blocks.push({
				text: lines.join("\n"),
				order: getOrder(main),
				id: main.id,
			});
		} else {
			for (const snippet of folderSnippets) {
				blocks.push({
					text: snippet.body,
					order: getOrder(snippet),
					id: snippet.id,
				});
			}
		}
	}
	return blocks;
}

export function composePrompt(
	userText: string,
	activeSnippets: Snippet[],
): string {
	if (activeSnippets.length === 0) return userText;

	const normalizePlacement = (snippet: Snippet): Snippet => {
		if (snippet.placement === "prepend") return snippet;
		return { ...snippet, placement: "append" as const };
	};
	const normalized = activeSnippets.map(normalizePlacement);

	const prependSnippets = normalized.filter((s) => s.placement === "prepend");
	const appendSnippets = normalized.filter((s) => s.placement === "append");

	const prependBlocks = buildBlocks(prependSnippets).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
	const appendBlocks = buildBlocks(appendSnippets).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

	const parts: string[] = [];
	if (prependBlocks.length > 0) parts.push(...prependBlocks.map((b) => b.text));
	parts.push(userText);
	if (appendBlocks.length > 0) parts.push(...appendBlocks.map((b) => b.text));

	return parts.join("\n\n");
}
