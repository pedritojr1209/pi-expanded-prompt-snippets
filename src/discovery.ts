import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import type { Snippet } from "../types/snippet.js";

const DEFAULT_ORDER = 9999;
const VALID_EXTENSIONS = [".md", ".markdown"];

export function parseSnippet(
	relativePath: string,
	raw: string,
	filePath: string,
): Snippet | null {
	const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
	if (!match) return null;

	const meta: Record<string, string> = {};
	for (const line of match[1].split(/\r?\n/)) {
		const kv = line.match(/^([A-Za-z][\w-]*)\s*:\s*(.*)$/);
		if (kv) meta[kv[1].toLowerCase()] = kv[2].trim().replace(/^["']|["']$/g, "");
	}

	const body = match[2].trim();
	if (!body) return null;

	const parsedOrder = Number.parseInt(meta.order ?? "", 10);
	const parsedMain = meta.main?.toLowerCase();
	const isMain = parsedMain === "true" || parsedMain === "1";
	const stem = relativePath.replace(/^.*[/\\]/, "").replace(/\.(md|markdown)$/i, "");

	return {
		id: normalizeId(relativePath),
		filePath,
		name: meta.name || stem,
		description: meta.description ?? "",
		placement: meta.placement === "prepend" ? "prepend" : "append",
		order: Number.isFinite(parsedOrder) ? parsedOrder : DEFAULT_ORDER,
		main: isMain,
		body,
	};
}

export function normalizeId(relativePath: string): string {
	let normalized = relativePath.replace(/\\/g, "/");
	normalized = normalized.replace(/^snippets\//, "");
	normalized = normalized.replace(/\.(md|markdown)$/i, "");
	return normalized;
}

export function loadSnippets(snippetsDir: string): Snippet[] {
	if (!existsSync(snippetsDir)) {
		return [];
	}

	const snippets: Snippet[] = [];

	function walk(dir: string, relativeDir: string): void {
		const entries = readdirSync(dir);
		for (const entry of entries) {
			const fullPath = join(dir, entry);
			const stat = statSync(fullPath);
			if (stat.isDirectory()) {
				walk(fullPath, join(relativeDir, entry));
			} else if (isValidExtension(entry)) {
				const relativePath = join(relativeDir, entry);
				const raw = readFileSync(fullPath, "utf8");
				const snippet = parseSnippet(relativePath, raw, fullPath);
				if (snippet) {
					snippets.push(snippet);
				}
			}
		}
	}

	walk(snippetsDir, "");

	const byFolder = new Map<string, Snippet[]>();
	for (const snippet of snippets) {
		const lastSlash = snippet.id.lastIndexOf("/");
		const folder = lastSlash === -1 ? "" : snippet.id.slice(0, lastSlash);
		const existing = byFolder.get(folder) ?? [];
		existing.push(snippet);
		byFolder.set(folder, existing);
	}

	const mainsByFolder = new Map<string, string>();
	for (const [, folderSnippets] of byFolder) {
		const mains = folderSnippets.filter((s) => s.main);
		if (mains.length <= 1) continue;
		const winner = mains.sort((a, b) => {
			if (a.order !== b.order) return a.order - b.order;
			return folderSnippets.indexOf(a) - folderSnippets.indexOf(b);
		})[0];
		const lastSlash = winner.id.lastIndexOf("/");
		const folder = lastSlash === -1 ? "" : winner.id.slice(0, lastSlash);
		mainsByFolder.set(folder, winner.id);
	}

	const byOrder = (a: Snippet, b: Snippet) => a.order - b.order || a.name.localeCompare(b.name);
	return snippets.map((s) => {
		const lastSlash = s.id.lastIndexOf("/");
		const folder = lastSlash === -1 ? "" : s.id.slice(0, lastSlash);
		const mainId = mainsByFolder.get(folder);
		if (mainId === undefined) return s;
		return { ...s, main: s.id === mainId };
	}).sort((a, b) => {
		const placementOrder = (a: Snippet, b: Snippet) => {
			if (a.placement === "prepend" && b.placement === "append") return -1;
			if (a.placement === "append" && b.placement === "prepend") return 1;
			return 0;
		};
		const cmp = placementOrder(a, b);
		if (cmp !== 0) return cmp;
		return byOrder(a, b);
	});
}

function isValidExtension(filename: string): boolean {
	return [".md", ".markdown"].includes(extname(filename).toLowerCase());
}
