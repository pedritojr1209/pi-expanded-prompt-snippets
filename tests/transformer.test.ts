/// <reference types="vitest/globals" />

import { describe, it, expect } from "vitest";
import type { Snippet } from "../types/snippet.js";
import { composePrompt } from "../src/transformer.js";

describe("composePrompt", () => {
	const userText = "User message here";

	it("defaults placement fallback to append when omitted", () => {
		const snippets: Snippet[] = [
			{
				id: "snippet-a",
				filePath: "/abs/snippets/snippet-a.md",
				name: "A",
				description: "",
				placement: "append",
				order: 1,
				main: false,
				body: "Body A",
			},
			{
				id: "snippet-b",
				filePath: "/abs/snippets/snippet-b.md",
				name: "B",
				description: "",
				placement: "append",
				order: 2,
				main: false,
				body: "Body B",
			},
		];
		const result = composePrompt(userText, snippets);
		const parts = result.split("\n\n");
		expect(parts).toContain("Body A");
		expect(parts).toContain("Body B");
		expect(parts).toContain(userText);
		const userIdx = parts.indexOf(userText);
		expect(parts.indexOf("Body A")).toBeGreaterThan(userIdx);
		expect(parts.indexOf("Body B")).toBeGreaterThan(userIdx);
	});

	it("sorts prepend snippets by order ascending before user message", () => {
		const snippets: Snippet[] = [
			{
				id: "high",
				filePath: "/abs/snippets/high.md",
				name: "High",
				description: "",
				placement: "prepend",
				order: 10,
				main: false,
				body: "High body",
			},
			{
				id: "low",
				filePath: "/abs/snippets/low.md",
				name: "Low",
				description: "",
				placement: "prepend",
				order: 1,
				main: false,
				body: "Low body",
			},
		];
		const result = composePrompt(userText, snippets);
		const parts = result.split("\n\n");
		const userIdx = parts.indexOf(userText);
		expect(parts[userIdx - 2]).toBe("Low body");
		expect(parts[userIdx - 1]).toBe("High body");
	});

	it("sorts append snippets by order ascending after user message", () => {
		const snippets: Snippet[] = [
			{
				id: "high",
				filePath: "/abs/snippets/high.md",
				name: "High",
				description: "",
				placement: "append",
				order: 10,
				main: false,
				body: "High body",
			},
			{
				id: "low",
				filePath: "/abs/snippets/low.md",
				name: "Low",
				description: "",
				placement: "append",
				order: 1,
				main: false,
				body: "Low body",
			},
		];
		const result = composePrompt(userText, snippets);
		const parts = result.split("\n\n");
		const userIdx = parts.indexOf(userText);
		expect(parts[userIdx + 1]).toBe("Low body");
		expect(parts[userIdx + 2]).toBe("High body");
	});

	it("ties order with path-sorted tiebreaking by id ascending", () => {
		const snippets: Snippet[] = [
			{
				id: "z",
				filePath: "/abs/snippets/z.md",
				name: "Z",
				description: "",
				placement: "prepend",
				order: 5,
				main: false,
				body: "Z body",
			},
			{
				id: "a",
				filePath: "/abs/snippets/a.md",
				name: "A",
				description: "",
				placement: "prepend",
				order: 5,
				main: false,
				body: "A body",
			},
		];
		const result = composePrompt(userText, snippets);
		const parts = result.split("\n\n");
		const userIdx = parts.indexOf(userText);
		expect(parts[userIdx - 2]).toBe("A body");
		expect(parts[userIdx - 1]).toBe("Z body");
	});

	it("formats folder main snippet as header with active children as bullets", () => {
		const snippets: Snippet[] = [
			{
				id: "group/main",
				filePath: "/abs/snippets/group/main.md",
				name: "Group Main",
				description: "",
				placement: "prepend",
				order: 1,
				main: true,
				body: "Group rules.",
			},
			{
				id: "group/child-a",
				filePath: "/abs/snippets/group/child-a.md",
				name: "Child A",
				description: "",
				placement: "prepend",
				order: 2,
				main: false,
				body: "Rule A.",
			},
			{
				id: "group/child-b",
				filePath: "/abs/snippets/group/child-b.md",
				name: "Child B",
				description: "",
				placement: "prepend",
				order: 3,
				main: false,
				body: "Rule B.",
			},
		];
		const result = composePrompt(userText, snippets);
		expect(result).toContain("## Group Main");
		expect(result).toContain("* Rule A.");
		expect(result).toContain("* Rule B.");
		const headerIdx = result.indexOf("## Group Main");
		const bulletAIdx = result.indexOf("* Rule A.");
		const bulletBIdx = result.indexOf("* Rule B.");
		expect(bulletAIdx).toBeGreaterThan(headerIdx);
		expect(bulletBIdx).toBeGreaterThan(bulletAIdx);
	});

	it("formats standalone children as standard text blocks when folder main is not active", () => {
		const allSnippets: Snippet[] = [
			{
				id: "group/main",
				filePath: "/abs/snippets/group/main.md",
				name: "Group Main",
				description: "",
				placement: "prepend",
				order: 1,
				main: true,
				body: "Group rules.",
			},
			{
				id: "group/child-a",
				filePath: "/abs/snippets/group/child-a.md",
				name: "Child A",
				description: "",
				placement: "prepend",
				order: 2,
				main: false,
				body: "Rule A.",
			},
		];
	const inactive = allSnippets.filter((s) => s.id !== "group/main");
	const result = composePrompt(userText, inactive);
	expect(result).not.toContain("## Group Main");
	expect(result).toBe("Rule A.\n\nUser message here");
	});

	it("keeps prepend and append separated by user message", () => {
		const snippets: Snippet[] = [
			{
				id: "pre",
				filePath: "/abs/snippets/pre.md",
				name: "Pre",
				description: "",
				placement: "prepend",
				order: 1,
				main: false,
				body: "Pre body",
			},
			{
				id: "post",
				filePath: "/abs/snippets/post.md",
				name: "Post",
				description: "",
				placement: "append",
				order: 1,
				main: false,
				body: "Post body",
			},
		];
		const result = composePrompt(userText, snippets);
		const parts = result.split("\n\n");
		const userIdx = parts.indexOf(userText);
		expect(parts[userIdx - 1]).toBe("Pre body");
		expect(parts[userIdx + 1]).toBe("Post body");
	});

	it("returns only user text when no active snippets", () => {
		const result = composePrompt(userText, []);
		expect(result).toBe(userText);
	});
});
