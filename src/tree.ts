import type { Snippet } from "../types/snippet.js";

export interface FolderNode {
	readonly type: "folder";
	readonly id: string;
	readonly name: string;
	readonly mainSnippetId: string | undefined;
	readonly children: TreeNode[];
}

export interface SnippetTreeNode {
	readonly type: "snippet";
	readonly id: string;
	readonly name: string;
}

export type TreeNode = FolderNode | SnippetTreeNode;

export interface TreeState {
	readonly expandedFolders: Set<string>;
	readonly enabled: Set<string>;
	readonly cursor: number;
}

export interface TreeRow {
	readonly node: TreeNode;
	readonly depth: number;
	readonly enabled: boolean;
	readonly expanded?: boolean;
	readonly isLast?: boolean;
}

export function buildTree(snippets: Snippet[]): TreeNode[] {
	if (snippets.length === 0) return [];

	const byFolder = new Map<string, Snippet[]>();
	const roots: Snippet[] = [];

	for (const snippet of snippets) {
		const folder = folderOf(snippet.id);
		if (folder === "") {
			roots.push(snippet);
		} else {
			let path = folder;
			while (true) {
				const existing = byFolder.get(path) ?? [];
				existing.push(snippet);
				byFolder.set(path, existing);
				const parent = folderOf(path);
				if (parent === "") break;
				path = parent;
			}
		}
	}

	const result: TreeNode[] = [];

	const folderPaths = [...byFolder.keys()];
	const topLevelFolderIds = folderPaths
		.filter((path) => {
			const parent = folderOf(path);
			return parent === "" || !byFolder.has(parent);
		})
		.sort();

	for (const folderId of topLevelFolderIds) {
		const folderSnippets = byFolder.get(folderId)!;
		const sorted = sortSnippets(folderSnippets);
		const direct = sorted.filter((s) => folderOf(s.id) === folderId);
		const mainSnippetId = direct.find((s) => s.main)?.id;
		const children = buildFolderChildren(sorted, folderId);
		result.push({
			type: "folder",
			id: folderId,
			name: folderId.split("/").pop() ?? folderId,
			mainSnippetId,
			children,
		});
	}

	const sortedRoots = sortSnippets(roots);
	for (const snippet of sortedRoots) {
		result.push(snippetToNode(snippet));
	}

	return result;
}

function buildFolderChildren(snippets: Snippet[], parentFolder: string): TreeNode[] {
	const direct: Snippet[] = [];
	const nestedMap = new Map<string, Snippet[]>();

	for (const snippet of snippets) {
		const remainder = snippet.id.slice(parentFolder.length + 1);
		const nextSlash = remainder.indexOf("/");
		if (nextSlash === -1) {
			direct.push(snippet);
		} else {
			const subFolder = parentFolder + "/" + remainder.slice(0, nextSlash);
			const existing = nestedMap.get(subFolder) ?? [];
			existing.push(snippet);
			nestedMap.set(subFolder, existing);
		}
	}

	const result: TreeNode[] = [];
	for (const snippet of sortSnippets(direct)) {
		result.push(snippetToNode(snippet));
	}

	const sortedSubFolderIds = [...nestedMap.keys()].sort();
	for (const subFolderId of sortedSubFolderIds) {
		const subSnippets = nestedMap.get(subFolderId)!;
		const sorted = sortSnippets(subSnippets);
		const mainSnippetId = sorted.filter((s) => folderOf(s.id) === subFolderId).find((s) => s.main)?.id;
		const children = buildFolderChildren(sorted, subFolderId);
		result.push({
			type: "folder",
			id: subFolderId,
			name: subFolderId.split("/").pop() ?? subFolderId,
			mainSnippetId,
			children,
		});
	}

	return result;
}

export function createInitialState(tree: TreeNode[]): TreeState {
	return {
		expandedFolders: new Set(),
		enabled: new Set(),
		cursor: 0,
	};
}

export function getVisibleRows(tree: TreeNode[], state: TreeState): TreeRow[] {
	const rows: TreeRow[] = [];
	appendVisibleRows(tree, state, 0, rows);
	return rows;
}

export function toggleExpandCollapse(
	tree: TreeNode[],
	state: TreeState,
	folderId: string,
): TreeState {
	if (findNode(tree, folderId)?.type !== "folder") return state;

	const isExpanded = state.expandedFolders.has(folderId);
	const nextExpanded = new Set(state.expandedFolders);

	if (isExpanded) {
		nextExpanded.delete(folderId);
	} else {
		nextExpanded.add(folderId);
	}

	const nextRows = getVisibleRows(tree, {
		...state,
		expandedFolders: nextExpanded,
	});
	const clampedCursor = Math.min(state.cursor, Math.max(0, nextRows.length - 1));

	return {
		expandedFolders: nextExpanded,
		enabled: state.enabled,
		cursor: clampedCursor,
	};
}

export function toggleSelection(
	tree: TreeNode[],
	state: TreeState,
	nodeId: string,
): TreeState {
	const node = findNode(tree, nodeId);
	if (!node) return state;

	const nextEnabled = new Set(state.enabled);

	if (node.type === "folder") {
		const isCurrentlyEnabled = node.mainSnippetId !== undefined && nextEnabled.has(node.mainSnippetId);

		if (isCurrentlyEnabled) {
			if (node.mainSnippetId) {
				nextEnabled.delete(node.mainSnippetId);
			}
			for (const child of node.children) {
				for (const id of collectSnippetIds(child)) {
					nextEnabled.delete(id);
				}
			}
			const nextExpanded = new Set(state.expandedFolders);
			nextExpanded.delete(node.id);
			const nextRows = getVisibleRows(tree, {
				...state,
				expandedFolders: nextExpanded,
			});
			const clampedCursor = Math.min(state.cursor, Math.max(0, nextRows.length - 1));
			return {
				expandedFolders: nextExpanded,
				enabled: nextEnabled,
				cursor: clampedCursor,
			};
		}

		if (node.mainSnippetId) {
			nextEnabled.add(node.mainSnippetId);
		}
		const nextExpanded = new Set(state.expandedFolders);
		nextExpanded.add(node.id);
		return {
			expandedFolders: nextExpanded,
			enabled: nextEnabled,
			cursor: state.cursor,
		};
	}

	if (nextEnabled.has(nodeId)) {
		nextEnabled.delete(nodeId);
	} else {
		nextEnabled.add(nodeId);
	}

	return {
		expandedFolders: state.expandedFolders,
		enabled: nextEnabled,
		cursor: state.cursor,
	};
}

export function moveCursor(
	tree: TreeNode[],
	state: TreeState,
	direction: "up" | "down",
): TreeState {
	const visibleCount = countVisibleRows(tree, state.expandedFolders);
	if (visibleCount === 0) return state;

	let nextCursor = state.cursor;
	if (direction === "up") {
		nextCursor = Math.max(0, state.cursor - 1);
	} else {
		nextCursor = Math.min(visibleCount - 1, state.cursor + 1);
	}

	return {
		expandedFolders: state.expandedFolders,
		enabled: state.enabled,
		cursor: nextCursor,
	};
}

function folderOf(id: string): string {
	const lastSlash = id.lastIndexOf("/");
	if (lastSlash === -1) return "";
	return id.slice(0, lastSlash);
}

function sortSnippets(snippets: Snippet[]): Snippet[] {
	return [...snippets].sort((a, b) => {
		if (a.order !== b.order) return a.order - b.order;
		return a.id.localeCompare(b.id);
	});
}

function snippetToNode(snippet: Snippet): SnippetTreeNode {
	return {
		type: "snippet",
		id: snippet.id,
		name: snippet.name,
	};
}

function countVisibleRows(tree: TreeNode[], expandedFolders: Set<string>): number {
	let count = 0;
	for (const node of tree) {
		count++;
		if (node.type === "folder" && expandedFolders.has(node.id)) {
			count += countVisibleRows(node.children, expandedFolders);
		}
	}
	return count;
}

function appendVisibleRows(
	tree: TreeNode[],
	state: TreeState,
	depth: number,
	rows: TreeRow[],
): void {
	for (let i = 0; i < tree.length; i++) {
		const node = tree[i];
		const isEnabled =
			node.type === "folder"
				? node.mainSnippetId !== undefined && state.enabled.has(node.mainSnippetId)
				: state.enabled.has(node.id);

		const isExpanded =
			node.type === "folder" ? state.expandedFolders.has(node.id) : undefined;

		rows.push({ node, depth, enabled: isEnabled, expanded: isExpanded, isLast: i === tree.length - 1 });

		if (node.type === "folder" && state.expandedFolders.has(node.id)) {
			appendVisibleRows(node.children, state, depth + 1, rows);
		}
	}
}

function findNode(tree: TreeNode[], nodeId: string): TreeNode | undefined {
	for (const node of tree) {
		if (node.id === nodeId) return node;
		if (node.type === "folder") {
			const found = findNode(node.children, nodeId);
			if (found) return found;
		}
	}
	return undefined;
}

function collectSnippetIds(node: TreeNode): string[] {
	if (node.type === "snippet") {
		return [node.id];
	}
	const ids: string[] = [];
	for (const child of node.children) {
		ids.push(...collectSnippetIds(child));
	}
	return ids;
}
