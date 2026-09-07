/// <reference types="vitest/globals" />

import { describe, it, expect } from "vitest";
import type { Snippet } from "../types/snippet.js";
import {
	buildTree,
	type TreeNode,
	type FolderNode,
	type SnippetTreeNode,
	type TreeState,
	type TreeRow,
	createInitialState,
	toggleExpandCollapse,
	toggleSelection,
	moveCursor,
	getVisibleRows,
} from "../src/tree.js";

const makeSnippet = (
	id: string,
	overrides: Partial<Snippet> = {},
): Snippet => ({
	id,
	filePath: `/abs/snippets/${id.replace(/\//g, "/")}.md`,
	name: id.split("/").pop() ?? id,
	description: "",
	placement: "append",
	order: 1,
	main: false,
	body: `Body of ${id}`,
	...overrides,
});

describe("buildTree", () => {
	it("converts flat snippet list into nested folder/child hierarchy", () => {
		const snippets: Snippet[] = [
			makeSnippet("group/a"),
			makeSnippet("group/b"),
			makeSnippet("group/sub/c"),
			makeSnippet("standalone"),
		];

		const tree = buildTree(snippets);

		const folderGroup = tree.find((n) => n.type === "folder" && n.id === "group") as FolderNode | undefined;
		expect(folderGroup).toBeDefined();
		expect(folderGroup!.name).toBe("group");

		const children = folderGroup!.children;
		expect(children.some((c) => c.type === "snippet" && c.id === "group/a")).toBe(true);
		expect(children.some((c) => c.type === "snippet" && c.id === "group/b")).toBe(true);

		const subFolder = children.find((c) => c.type === "folder" && c.id === "group/sub") as FolderNode | undefined;
		expect(subFolder).toBeDefined();
		expect(subFolder!.children.some((c) => c.type === "snippet" && c.id === "group/sub/c")).toBe(true);

		const standalone = tree.find((n) => n.type === "snippet" && n.id === "standalone");
		expect(standalone).toBeDefined();
	});

	it("places root-level snippets without folders directly in the tree", () => {
		const snippets: Snippet[] = [
			makeSnippet("alpha"),
			makeSnippet("beta"),
		];

		const tree = buildTree(snippets);
		expect(tree.length).toBe(2);
		expect(tree.every((n) => n.type === "snippet")).toBe(true);
	});

	it("associates a folder's mainSnippetId when a snippet has main: true", () => {
		const snippets: Snippet[] = [
			makeSnippet("group/a", { main: true }),
			makeSnippet("group/b"),
		];

		const tree = buildTree(snippets);
		const folder = tree.find((n) => n.type === "folder" && n.id === "group") as FolderNode;
		expect(folder.mainSnippetId).toBe("group/a");
	});

	it("leaves mainSnippetId undefined when no snippet has main: true", () => {
		const snippets: Snippet[] = [
			makeSnippet("group/a"),
			makeSnippet("group/b"),
		];

		const tree = buildTree(snippets);
		const folder = tree.find((n) => n.type === "folder" && n.id === "group") as FolderNode;
		expect(folder.mainSnippetId).toBeUndefined();
	});

	it("preserves snippet order within folders", () => {
		const snippets: Snippet[] = [
			makeSnippet("group/b"),
			makeSnippet("group/a"),
			makeSnippet("group/sub/c"),
		];

		const tree = buildTree(snippets);
		const folder = tree.find((n) => n.type === "folder" && n.id === "group") as FolderNode;
		const snippetIds = folder.children
			.filter((c): c is SnippetTreeNode => c.type === "snippet")
			.map((c) => c.id);
		expect(snippetIds).toEqual(["group/a", "group/b"]);
	});

	it("returns empty array for empty input", () => {
		const tree = buildTree([]);
		expect(tree).toEqual([]);
	});

	it("does not inherit mainSnippetId from nested descendant folders", () => {
		const snippets: Snippet[] = [
			makeSnippet("parent/child/leaf", { main: true }),
			makeSnippet("parent/sibling"),
		];

		const tree = buildTree(snippets);
		const parent = tree.find((n) => n.type === "folder" && n.id === "parent") as FolderNode | undefined;
		const child = parent?.children.find((n) => n.type === "folder" && n.id === "parent/child") as FolderNode | undefined;

		expect(parent).toBeDefined();
		expect(parent!.mainSnippetId).toBeUndefined();
		expect(child).toBeDefined();
		expect(child!.mainSnippetId).toBe("parent/child/leaf");
	});

	it("resolves mainSnippetId on deeply nested subfolders", () => {
		const snippets: Snippet[] = [
			makeSnippet("role/agent/sub", { main: true }),
			makeSnippet("role/agent/other"),
			makeSnippet("role/standalone"),
		];

		const tree = buildTree(snippets);
		const role = tree.find((n) => n.type === "folder" && n.id === "role") as FolderNode | undefined;
		const agent = role?.children.find((n) => n.type === "folder" && n.id === "role/agent") as FolderNode | undefined;

		expect(role).toBeDefined();
		expect(agent).toBeDefined();
		expect(agent!.mainSnippetId).toBe("role/agent/sub");
	});
});

describe("createInitialState", () => {
	it("creates state with all folders collapsed and empty enabled set", () => {
		const snippets: Snippet[] = [
			makeSnippet("group/a"),
			makeSnippet("group/b"),
		];
		const tree = buildTree(snippets);
		const state = createInitialState(tree);

		expect(state.expandedFolders.size).toBe(0);
		expect(state.enabled.size).toBe(0);
		expect(state.cursor).toBe(0);
	});

	it("clamps cursor to 0 when tree is empty", () => {
		const state = createInitialState([]);
		expect(state.cursor).toBe(0);
	});
});

describe("getVisibleRows", () => {
	it("returns all root nodes when no folders are expanded", () => {
		const snippets: Snippet[] = [
			makeSnippet("group/a"),
			makeSnippet("group/b"),
			makeSnippet("standalone"),
		];
		const tree = buildTree(snippets);
		const state: TreeState = {
			expandedFolders: new Set(),
			enabled: new Set(),
			cursor: 0,
		};

		const rows = getVisibleRows(tree, state);
		expect(rows.length).toBe(2);
		expect(rows[0].node.type).toBe("folder");
		expect(rows[0].node.id).toBe("group");
		expect(rows[1].node.type).toBe("snippet");
		expect(rows[1].node.id).toBe("standalone");
	});

	it("includes children of expanded folders", () => {
		const snippets: Snippet[] = [
			makeSnippet("group/a"),
			makeSnippet("group/b"),
			makeSnippet("standalone"),
		];
		const tree = buildTree(snippets);
		const state: TreeState = {
			expandedFolders: new Set(["group"]),
			enabled: new Set(),
			cursor: 0,
		};

		const rows = getVisibleRows(tree, state);
		expect(rows.length).toBe(4);
		expect(rows[0].node.type).toBe("folder");
		expect(rows[0].node.id).toBe("group");
		expect(rows[1].node.type).toBe("snippet");
		expect(rows[1].node.id).toBe("group/a");
		expect(rows[2].node.type).toBe("snippet");
		expect(rows[2].node.id).toBe("group/b");
		expect(rows[3].node.type).toBe("snippet");
		expect(rows[3].node.id).toBe("standalone");
	});

	it("reflects enabled state for snippets", () => {
		const snippets: Snippet[] = [
			makeSnippet("group/a", { main: true }),
			makeSnippet("group/b"),
			makeSnippet("standalone"),
		];
		const tree = buildTree(snippets);
		const state: TreeState = {
			expandedFolders: new Set(),
			enabled: new Set(["group/a"]),
			cursor: 0,
		};

		const rows = getVisibleRows(tree, state);
		expect(rows[0].enabled).toBe(true);
		expect(rows[1].enabled).toBe(false);
	});

	it("reflects enabled state for folder mains", () => {
		const snippets: Snippet[] = [
			makeSnippet("group/a", { main: true }),
			makeSnippet("group/b"),
		];
		const tree = buildTree(snippets);
		const state: TreeState = {
			expandedFolders: new Set(),
			enabled: new Set(["group/a"]),
			cursor: 0,
		};

		const rows = getVisibleRows(tree, state);
		expect(rows[0].enabled).toBe(true);
	});

	it("marks folders as expanded in row metadata", () => {
		const snippets: Snippet[] = [
			makeSnippet("group/a"),
			makeSnippet("standalone"),
		];
		const tree = buildTree(snippets);
		const state: TreeState = {
			expandedFolders: new Set(["group"]),
			enabled: new Set(),
			cursor: 0,
		};

		const rows = getVisibleRows(tree, state);
		expect(rows[0].expanded).toBe(true);
		expect(rows[1].expanded).toBeUndefined();
	});
});

describe("toggleExpandCollapse", () => {
	it("expands a collapsed folder", () => {
		const snippets: Snippet[] = [makeSnippet("group/a")];
		const tree = buildTree(snippets);
		const state: TreeState = {
			expandedFolders: new Set(),
			enabled: new Set(),
			cursor: 0,
		};

		const next = toggleExpandCollapse(tree, state, "group");
		expect(next.expandedFolders.has("group")).toBe(true);
	});

	it("collapses an expanded folder", () => {
		const snippets: Snippet[] = [makeSnippet("group/a")];
		const tree = buildTree(snippets);
		const state: TreeState = {
			expandedFolders: new Set(["group"]),
			enabled: new Set(),
			cursor: 1,
		};

		const next = toggleExpandCollapse(tree, state, "group");
		expect(next.expandedFolders.has("group")).toBe(false);
	});

	it("clamps cursor when collapsing moves visible rows above cursor", () => {
		const snippets: Snippet[] = [
			makeSnippet("group/a"),
			makeSnippet("group/b"),
			makeSnippet("standalone"),
		];
		const tree = buildTree(snippets);
		const state: TreeState = {
			expandedFolders: new Set(["group"]),
			enabled: new Set(),
			cursor: 2,
		};

		const next = toggleExpandCollapse(tree, state, "group");
		expect(next.cursor).toBe(1);
	});

	it("does nothing for non-existent folder ids", () => {
		const snippets: Snippet[] = [makeSnippet("group/a")];
		const tree = buildTree(snippets);
		const state: TreeState = {
			expandedFolders: new Set(),
			enabled: new Set(),
			cursor: 0,
		};

		const next = toggleExpandCollapse(tree, state, "nonexistent");
		expect(next).toBe(state);
	});
});

describe("toggleSelection", () => {
	it("toggles a leaf snippet in enabled set", () => {
		const snippets: Snippet[] = [makeSnippet("group/a")];
		const tree = buildTree(snippets);
		const state: TreeState = {
			expandedFolders: new Set(),
			enabled: new Set(),
			cursor: 0,
		};

		const next = toggleSelection(tree, state, "group/a");
		expect(next.enabled.has("group/a")).toBe(true);

		const again = toggleSelection(tree, next, "group/a");
		expect(again.enabled.has("group/a")).toBe(false);
	});

	it("toggles a folder's main snippet when folder is toggled", () => {
		const snippets: Snippet[] = [
			makeSnippet("group/a", { main: true }),
			makeSnippet("group/b"),
		];
		const tree = buildTree(snippets);
		const state: TreeState = {
			expandedFolders: new Set(),
			enabled: new Set(),
			cursor: 0,
		};

		const next = toggleSelection(tree, state, "group");
		expect(next.enabled.has("group/a")).toBe(true);
		expect(next.enabled.has("group/b")).toBe(false);
	});

	it("does not enable any snippet when folder has no main and is toggled", () => {
		const snippets: Snippet[] = [
			makeSnippet("group/a"),
			makeSnippet("group/b"),
		];
		const tree = buildTree(snippets);
		const state: TreeState = {
			expandedFolders: new Set(),
			enabled: new Set(),
			cursor: 0,
		};

		const next = toggleSelection(tree, state, "group");
		expect(next.enabled.size).toBe(0);
	});

	it("untoggles only the folder main when a folder with main is untoggled", () => {
		const snippets: Snippet[] = [
			makeSnippet("group/a", { main: true }),
			makeSnippet("group/b"),
		];
		const tree = buildTree(snippets);
		const state: TreeState = {
			expandedFolders: new Set(),
			enabled: new Set(["group/a"]),
			cursor: 0,
		};

		const next = toggleSelection(tree, state, "group");
		expect(next.enabled.has("group/a")).toBe(false);
	});

	it("does not toggle leaf snippets when a folder with main is toggled", () => {
		const snippets: Snippet[] = [
			makeSnippet("group/a", { main: true }),
			makeSnippet("group/b"),
		];
		const tree = buildTree(snippets);
		const state: TreeState = {
			expandedFolders: new Set(),
			enabled: new Set(["group/b"]),
			cursor: 0,
		};

		const next = toggleSelection(tree, state, "group");
		expect(next.enabled.has("group/b")).toBe(true);
		expect(next.enabled.has("group/a")).toBe(true);
	});
});

describe("moveCursor", () => {
	it("moves cursor down within visible rows", () => {
		const snippets: Snippet[] = [
			makeSnippet("a"),
			makeSnippet("b"),
			makeSnippet("c"),
		];
		const tree = buildTree(snippets);
		const state: TreeState = {
			expandedFolders: new Set(),
			enabled: new Set(),
			cursor: 0,
		};

		const next = moveCursor(tree, state, "down");
		expect(next.cursor).toBe(1);
	});

	it("moves cursor up within visible rows", () => {
		const snippets: Snippet[] = [
			makeSnippet("a"),
			makeSnippet("b"),
			makeSnippet("c"),
		];
		const tree = buildTree(snippets);
		const state: TreeState = {
			expandedFolders: new Set(),
			enabled: new Set(),
			cursor: 2,
		};

		const next = moveCursor(tree, state, "up");
		expect(next.cursor).toBe(1);
	});

	it("clamps cursor to lower bound on up at top", () => {
		const snippets: Snippet[] = [makeSnippet("a")];
		const tree = buildTree(snippets);
		const state: TreeState = {
			expandedFolders: new Set(),
			enabled: new Set(),
			cursor: 0,
		};

		const next = moveCursor(tree, state, "up");
		expect(next.cursor).toBe(0);
	});

	it("clamps cursor to upper bound on down at bottom", () => {
		const snippets: Snippet[] = [makeSnippet("a")];
		const tree = buildTree(snippets);
		const state: TreeState = {
			expandedFolders: new Set(),
			enabled: new Set(),
			cursor: 0,
		};

		const next = moveCursor(tree, state, "down");
		expect(next.cursor).toBe(0);
	});

	it("skips hidden children when navigating collapsed folders", () => {
		const snippets: Snippet[] = [
			makeSnippet("group/a"),
			makeSnippet("group/b"),
			makeSnippet("standalone"),
		];
		const tree = buildTree(snippets);
		const state: TreeState = {
			expandedFolders: new Set(),
			enabled: new Set(),
			cursor: 0,
		};

		const next = moveCursor(tree, state, "down");
		expect(next.cursor).toBe(1);
	});

	it("navigates through expanded children", () => {
		const snippets: Snippet[] = [
			makeSnippet("group/a"),
			makeSnippet("group/b"),
			makeSnippet("standalone"),
		];
		const tree = buildTree(snippets);
		const state: TreeState = {
			expandedFolders: new Set(["group"]),
			enabled: new Set(),
			cursor: 0,
		};

		const next = moveCursor(tree, state, "down");
		expect(next.cursor).toBe(1);
	});
});
