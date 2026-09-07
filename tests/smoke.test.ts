/// <reference types="vitest/globals" />

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const extensionDir = dirname(fileURLToPath(import.meta.url));
const snippetsDir = join(extensionDir, "..", "snippets");

describe("snippets/", () => {
	it("exists on disk", () => {
		expect(existsSync(snippetsDir)).toBe(true);
	});

	it("is readable", () => {
		const files = readdirSync(snippetsDir);
		expect(Array.isArray(files)).toBe(true);
		expect(files.length).toBeGreaterThan(0);
	});

	it("contains parseable markdown files", () => {
		const files = readdirSync(snippetsDir).filter((f) => f.toLowerCase().endsWith(".md"));
		for (const file of files) {
			const raw = readFileSync(join(snippetsDir, file), "utf8");
			expect(raw).toMatch(/^---\r?\n/);
		}
	});
});
