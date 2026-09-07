/// <reference types="vitest/globals" />

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadSnippets, parseSnippet } from "../src/discovery.js";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

describe("loadSnippets", () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = join(process.cwd(), ".tmp-test-discovery");
		if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
		mkdirSync(tmpDir, { recursive: true });
	});

	afterEach(() => {
		if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
	});

	it("returns empty array when snippets dir does not exist", () => {
		const result = loadSnippets(join(tmpDir, "nonexistent"));
		expect(result).toEqual([]);
	});

	it("returns empty array for empty directory", () => {
		const dir = join(tmpDir, "snippets");
		mkdirSync(dir, { recursive: true });
		const result = loadSnippets(dir);
		expect(result).toEqual([]);
	});

	it("recursively scans nested folders", () => {
		const nested = join(tmpDir, "snippets", "code", "review");
		mkdirSync(nested, { recursive: true });
		writeFileSync(
			join(nested, "strict.md"),
			`---
name: Strict Review
placement: prepend
order: 10
---
Strict review rules.`,
		);

		const result = loadSnippets(join(tmpDir, "snippets"));
		expect(result.length).toBe(1);
		expect(result[0].id).toBe("code/review/strict");
		expect(result[0].name).toBe("Strict Review");
		expect(result[0].placement).toBe("prepend");
		expect(result[0].order).toBe(10);
		expect(result[0].body).toBe("Strict review rules.");
	});

	it("normalizes Windows backslashes to POSIX forward slashes", () => {
		const nested = join(tmpDir, "snippets", "code", "review");
		mkdirSync(nested, { recursive: true });
		writeFileSync(
			join(nested, "strict.md"),
			`---
name: Strict
placement: append
order: 5
---
Body`,
		);

		const result = loadSnippets(join(tmpDir, "snippets"));
		expect(result[0].id).toBe("code/review/strict");
		expect(result[0].id).not.toContain("\\");
	});

	it("strips root snippets/ prefix and file extensions from IDs", () => {
		const nested = join(tmpDir, "snippets", "@orchestrator");
		mkdirSync(nested, { recursive: true });
		writeFileSync(
			join(nested, "lead.markdown"),
			`---
name: Lead
placement: append
order: 1
---
Body`,
		);

		const result = loadSnippets(join(tmpDir, "snippets"));
		expect(result[0].id).toBe("@orchestrator/lead");
		expect(result[0].id).not.toContain(".markdown");
		expect(result[0].id).not.toContain("snippets");
	});

	it("accepts both .md and .markdown, ignores .txt and .json", () => {
		const dir = join(tmpDir, "snippets");
		mkdirSync(dir, { recursive: true });
		writeFileSync(
			join(dir, "a.md"),
			`---
name: A
placement: append
order: 1
---
Body A`,
		);
		writeFileSync(
			join(dir, "b.markdown"),
			`---
name: B
placement: append
order: 2
---
Body B`,
		);
		writeFileSync(join(dir, "c.txt"), `---
name: C
placement: append
order: 3
---
Body C`);
		writeFileSync(join(dir, "d.json"), `{"name": "D"}`);

		const result = loadSnippets(join(tmpDir, "snippets"));
		const ids = result.map((s) => s.id).sort();
		expect(ids).toEqual(["a", "b"]);
	});

	it("defaults placement to append when omitted", () => {
		const dir = join(tmpDir, "snippets");
		mkdirSync(dir, { recursive: true });
		writeFileSync(
			join(dir, "default.md"),
			`---
name: Default
order: 1
---
Body`,
		);

		const result = loadSnippets(join(tmpDir, "snippets"));
		expect(result[0].placement).toBe("append");
	});

	it("defaults placement to append when invalid", () => {
		const dir = join(tmpDir, "snippets");
		mkdirSync(dir, { recursive: true });
		writeFileSync(
			join(dir, "invalid.md"),
			`---
name: Invalid
placement: middle
order: 1
---
Body`,
		);

		const result = loadSnippets(join(tmpDir, "snippets"));
		expect(result[0].placement).toBe("append");
	});

	it("defaults order to 9999 when missing or invalid", () => {
		const dir = join(tmpDir, "snippets");
		mkdirSync(dir, { recursive: true });
		writeFileSync(
			join(dir, "noorder.md"),
			`---
name: No Order
placement: append
---
Body`,
		);
		writeFileSync(
			join(dir, "badorder.md"),
			`---
name: Bad Order
placement: append
order: abc
---
Body`,
		);

		const result = loadSnippets(join(tmpDir, "snippets"));
		expect(result[0].order).toBe(9999);
		expect(result[1].order).toBe(9999);
	});

	it("defaults main to false when omitted", () => {
		const dir = join(tmpDir, "snippets");
		mkdirSync(dir, { recursive: true });
		writeFileSync(
			join(dir, "a.md"),
			`---
name: A
placement: append
order: 1
---
Body`,
		);

		const result = loadSnippets(join(tmpDir, "snippets"));
		expect(result[0].main).toBe(false);
	});

	it("identifies main snippet in a folder with main: true", () => {
		const nested = join(tmpDir, "snippets", "group");
		mkdirSync(nested, { recursive: true });
		writeFileSync(
			join(nested, "a.md"),
			`---
name: A
placement: append
order: 1
main: true
---
Body A`,
		);
		writeFileSync(
			join(nested, "b.md"),
			`---
name: B
placement: append
order: 2
main: false
---
Body B`,
		);

		const result = loadSnippets(join(tmpDir, "snippets"));
		const mainSnippets = result.filter((s) => s.main);
		expect(mainSnippets.length).toBe(1);
		expect(mainSnippets[0].id).toBe("group/a");
	});

	it("resolves main collisions by lowest order in same folder", () => {
		const nested = join(tmpDir, "snippets", "group");
		mkdirSync(nested, { recursive: true });
		writeFileSync(
			join(nested, "a.md"),
			`---
name: A
placement: append
order: 10
main: true
---
Body A`,
		);
		writeFileSync(
			join(nested, "b.md"),
			`---
name: B
placement: append
order: 5
main: true
---
Body B`,
		);

		const result = loadSnippets(join(tmpDir, "snippets"));
		const mainSnippets = result.filter((s) => s.main);
		expect(mainSnippets.length).toBe(1);
		expect(mainSnippets[0].id).toBe("group/b");
	});

	it("resolves main collisions by first discovered when order ties", () => {
		const nested = join(tmpDir, "snippets", "group");
		mkdirSync(nested, { recursive: true });
		writeFileSync(
			join(nested, "a.md"),
			`---
name: A
placement: append
order: 5
main: true
---
Body A`,
		);
		writeFileSync(
			join(nested, "b.md"),
			`---
name: B
placement: append
order: 5
main: true
---
Body B`,
		);

		const result = loadSnippets(join(tmpDir, "snippets"));
		const mainSnippets = result.filter((s) => s.main);
		expect(mainSnippets.length).toBe(1);
		expect(mainSnippets[0].id).toBe("group/a");
	});

	it("returns filePath as absolute OS-native path", () => {
		const dir = join(tmpDir, "snippets");
		mkdirSync(dir, { recursive: true });
		writeFileSync(
			join(dir, "a.md"),
			`---
name: A
placement: append
order: 1
---
Body`,
		);

		const result = loadSnippets(join(tmpDir, "snippets"));
		expect(existsSync(result[0].filePath)).toBe(true);
	});

	it("sorts prepend before append, then by order and name", () => {
		const dir = join(tmpDir, "snippets");
		mkdirSync(dir, { recursive: true });
		writeFileSync(
			join(dir, "z-prepend.md"),
			`---
name: Z Prepend
placement: prepend
order: 10
---
Body ZP`,
		);
		writeFileSync(
			join(dir, "a-prepend.md"),
			`---
name: A Prepend
placement: prepend
order: 5
---
Body AP`,
		);
		writeFileSync(
			join(dir, "z-append.md"),
			`---
name: Z Append
placement: append
order: 10
---
Body ZA`,
		);
		writeFileSync(
			join(dir, "a-append.md"),
			`---
name: A Append
placement: append
order: 5
---
Body AA`,
		);

		const result = loadSnippets(join(tmpDir, "snippets"));
		expect(result.map((s) => s.id)).toEqual([
			"a-prepend",
			"z-prepend",
			"a-append",
			"z-append",
		]);
	});
});

describe("parseSnippet", () => {
	it("parses all frontmatter fields correctly", () => {
		const raw = `---
name: Test
description: A test snippet
placement: prepend
order: 10
main: true
---
This is the body.
`;
		const result = parseSnippet(
			"test.md",
			raw,
			"/absolute/path/snippets/test.md",
		);
		expect(result).not.toBeNull();
		expect(result!.name).toBe("Test");
		expect(result!.description).toBe("A test snippet");
		expect(result!.placement).toBe("prepend");
		expect(result!.order).toBe(10);
		expect(result!.main).toBe(true);
		expect(result!.body).toBe("This is the body.");
		expect(result!.filePath).toBe("/absolute/path/snippets/test.md");
		expect(result!.id).toBe("test");
	});

	it("returns null for missing frontmatter", () => {
		const result = parseSnippet("bad.md", "no frontmatter here", "/abs/path");
		expect(result).toBeNull();
	});

	it("returns null when body is empty", () => {
		const result = parseSnippet(
			"empty.md",
			`---
name: Empty
---
`,
			"/abs/path",
		);
		expect(result).toBeNull();
	});

	it("defaults placement to append when omitted", () => {
		const result = parseSnippet(
			"test.md",
			`---
name: Test
order: 1
---
Body`,
			"/abs/path",
		);
		expect(result!.placement).toBe("append");
	});

	it("defaults main to false when omitted", () => {
		const result = parseSnippet(
			"test.md",
			`---
name: Test
placement: append
order: 1
---
Body`,
			"/abs/path",
		);
		expect(result!.main).toBe(false);
	});

	it("defaults order to 9999 when invalid", () => {
		const result = parseSnippet(
			"test.md",
			`---
name: Test
placement: append
order: abc
---
Body`,
			"/abs/path",
		);
		expect(result!.order).toBe(9999);
	});

	it("strips snippets/ prefix from ID", () => {
		const result = parseSnippet(
			"snippets/code/review/strict.md",
			`---
name: Strict
placement: append
order: 1
---
Body`,
			"/abs/path",
		);
		expect(result!.id).toBe("code/review/strict");
	});

	it("normalizes Windows backslashes in ID", () => {
		const result = parseSnippet(
			"code\\review\\strict.md",
			`---
name: Strict
placement: append
order: 1
---
Body`,
			"/abs/path",
		);
		expect(result!.id).toBe("code/review/strict");
	});

	it("falls back to filename stem when name is missing", () => {
		const result = parseSnippet(
			"code/review/strict.md",
			`---
placement: append
order: 1
---
Body`,
			"/abs/path",
		);
		expect(result!.name).toBe("strict");
	});

	it("parses main: false correctly", () => {
		const result = parseSnippet(
			"test.md",
			`---
name: Test
main: false
---
Body`,
			"/abs/path",
		);
		expect(result!.main).toBe(false);
	});
});
