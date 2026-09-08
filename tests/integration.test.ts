/// <reference types="vitest/globals" />

import { describe, it, expect, vi } from "vitest";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const extensionDir = dirname(fileURLToPath(import.meta.url));

vi.mock("@earendil-works/pi-coding-agent", () => ({
	ExtensionAPI: {},
	ExtensionContext: {},
}));

vi.mock("@earendil-works/pi-tui", () => ({
	Key: {
		up: "up",
		down: "down",
		left: "left",
		right: "right",
		space: " ",
		tab: "tab",
		enter: "enter",
		escape: "escape",
	},
	matchesKey: (data: string, key: string) => data === key,
	truncateToWidth: (text: string, width: number) => (text.length <= width ? text : text.slice(0, width)),
	wrapTextWithAnsi: (text: string, width: number) => {
		const lines: string[] = [];
		let remaining = text;
		while (remaining.length > width) {
			lines.push(remaining.slice(0, width));
			remaining = remaining.slice(width);
		}
		if (remaining.length > 0) lines.push(remaining);
		return lines.length > 0 ? lines : [""];
	},
}));

describe("extension integration", () => {
	const registeredShortcuts: Record<string, { description: string; handler: (ctx: any) => void }> = {};
	const registeredCommands: Record<string, { description: string; handler: (args: any, ctx: any) => void }> = {};
	const eventHandlers: any = {};
	const widgetLines: string[][] = [];
	const notifications: string[] = [];

	const makePi = () => ({
		on: vi.fn((event: string, handler: (event: any, ctx: any) => void) => {
			if (!eventHandlers[event]) eventHandlers[event] = [];
			eventHandlers[event].push(handler);
		}),
		registerShortcut: vi.fn((key: string, config: { description: string; handler: (ctx: any) => void }) => {
			registeredShortcuts[key] = config;
		}),
		registerCommand: vi.fn((name: string, config: { description: string; handler: (args: any, ctx: any) => void }) => {
			registeredCommands[name] = config;
		}),
	});

	const makeCtx = () => ({
		hasUI: true,
		mode: "tui",
		ui: {
			setWidget: (_id: string, lines?: string[]) => {
				widgetLines.push(lines ?? []);
			},
			notify: (message: string) => {
				notifications.push(message);
			},
			custom: vi.fn(),
			theme: {
				fg: (_color: string, text: string) => text,
				dim: (text: string) => text,
				bold: (text: string) => text,
				accent: (text: string) => text,
				warning: (text: string) => text,
				success: (text: string) => text,
			},
		},
	});

	it("registers the snippets shortcut", async () => {
		vi.resetModules();
		const mod = await import("../index.js");
		const pi = makePi();
		mod.default(pi as any);
		expect(registeredShortcuts["alt+s"]).toBeDefined();
		expect(registeredShortcuts["alt+s"].description).toBe("Toggle prompt snippets");
	});

	it("registers the snippets command", async () => {
		vi.resetModules();
		const mod = await import("../index.js");
		const pi = makePi();
		mod.default(pi as any);
		expect(registeredCommands["snippets"]).toBeDefined();
		expect(registeredCommands["snippets"].description).toBe("Open the prompt snippet toggle menu");
	});

	it("registers session_start and input lifecycle hooks", async () => {
		vi.resetModules();
		const mod = await import("../index.js");
		const pi = makePi();
		mod.default(pi as any);
		expect(pi.on).toHaveBeenCalledWith("session_start", expect.any(Function));
		expect(pi.on).toHaveBeenCalledWith("input", expect.any(Function));
	});

	it("runs full input transformation pipeline", async () => {
		const testDir = join(extensionDir, ".tmp-integration-test");
		if (existsSync(testDir)) rmSync(testDir, { recursive: true });
		mkdirSync(testDir, { recursive: true });
		mkdirSync(join(testDir, "rules"), { recursive: true });
		writeFileSync(
			join(testDir, "rules", "style.md"),
			`---
name: Style Guide
placement: prepend
order: 1
main: true
---
Use clear language.`,
		);
		writeFileSync(
			join(testDir, "rules", "extra.md"),
			`---
name: Extra Notes
placement: prepend
order: 2
---
Additional context.`,
		);

		vi.resetModules();
		const mod = await import("../index.js");
		const pi = makePi();
		mod.default(pi as any, { snippetsDir: testDir });

		try {
			const inputHandler = (pi.on as any).mock.calls.find((c: any[]) => c[0] === "input")?.[1];
			expect(inputHandler).toBeDefined();

			const sessionHandler = (pi.on as any).mock.calls.find((c: any[]) => c[0] === "session_start")?.[1];
			const ctx = makeCtx();
			await sessionHandler(null, ctx);

			// Simulate user opening menu, selecting first snippet, and confirming
			const openMenuHandler = (pi.registerShortcut as any).mock.calls.find(
				(c: any[]) => c[0] === "alt+s",
			)?.[1]?.handler;
			expect(openMenuHandler).toBeDefined();

			let resolvedWith = false;
			(ctx.ui.custom as any).mockImplementation((rendererFn: any) => {
				const tui = { requestRender: vi.fn() };
				const theme = {
					fg: (_c: string, t: string) => t,
					dim: (t: string) => t,
					bold: (t: string) => t,
					accent: (t: string) => t,
					warning: (t: string) => t,
					success: (t: string) => t,
				};
				const keybindings = {};
				const obj = rendererFn(tui, theme, keybindings, (result: boolean) => {
					resolvedWith = result;
					return result;
				});

				obj.handleInput("right");
				obj.handleInput("down");
				obj.handleInput(" ");
				obj.handleInput("down");
				obj.handleInput(" ");
				obj.handleInput("enter");

				return Promise.resolve(true);
			});

			await openMenuHandler(ctx);
			expect(resolvedWith).toBe(true);

			const result = await inputHandler({ text: "Hello world" }, ctx);

			expect(result).toBeDefined();
			expect(result.action).toBe("transform");
			expect(result.text).toContain("Hello world");
			expect(result.text).toContain("Use clear language.");
			expect(result.text).toContain("Additional context.");
		} finally {
			if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
		}
	});

	it("clears enabled snippets and updates widget on session_start", async () => {
		vi.resetModules();
		const mod = await import("../index.js");
		const pi = makePi();
		mod.default(pi as any);

		const sessionHandler = (pi.on as any).mock.calls.find((c: any[]) => c[0] === "session_start")?.[1];
		const inputHandler = (pi.on as any).mock.calls.find((c: any[]) => c[0] === "input")?.[1];
		expect(sessionHandler).toBeDefined();

		const ctx = makeCtx();
		await sessionHandler(null, ctx);

		const secondInput = await inputHandler({ text: "test" }, ctx);
		expect(secondInput).toBeUndefined();
	});

	it("renders active cursor pointer on exactly one row", async () => {
		const testDir = join(extensionDir, ".tmp-cursor-test");
		if (existsSync(testDir)) rmSync(testDir, { recursive: true });
		mkdirSync(testDir, { recursive: true });
		writeFileSync(join(testDir, "a.md"), `---\nname: A\nplacement: append\norder: 1\n---\nBody A`);
		writeFileSync(join(testDir, "b.md"), `---\nname: B\nplacement: append\norder: 2\n---\nBody B`);
		writeFileSync(join(testDir, "c.md"), `---\nname: C\nplacement: append\norder: 3\n---\nBody C`);

		try {
			vi.resetModules();
			const mod = await import("../index.js");
			const pi = makePi();
			mod.default(pi as any, { snippetsDir: testDir });

			const openMenuHandler = (pi.registerShortcut as any).mock.calls.find(
				(c: any[]) => c[0] === "alt+s",
			)?.[1]?.handler;
			expect(openMenuHandler).toBeDefined();

			const width = 80;
			let rendererObj: any;
			const ctx = makeCtx();

			(ctx.ui.custom as any).mockImplementation((rendererFn: any) => {
				const tui = { requestRender: vi.fn(), terminal: { rows: 24 } };
				const theme = {
					fg: (_c: string, text: string) => text,
					dim: (text: string) => text,
					bold: (text: string) => text,
					accent: (text: string) => text,
					warning: (text: string) => text,
					success: (text: string) => text,
				};
				const keybindings = {};
				rendererObj = rendererFn(tui, theme, keybindings, () => {});
				return Promise.resolve(false);
			});

			await openMenuHandler(ctx);

			const contentRows = (rendererObj.render(width) as string[]).slice(3, -3);

			expect(contentRows.length).toBeGreaterThan(0);

			for (let cursor = 0; cursor < contentRows.length; cursor++) {
				if (cursor > 0) {
					rendererObj.handleInput("down");
				}

				const rows = rendererObj.render(width).slice(3, -3);
				const pointerRows = rows.filter((r: string) => r.startsWith("> "));

				expect(pointerRows).toHaveLength(1);
				const activeRowIndex = rows.indexOf(pointerRows[0]);
				expect(activeRowIndex).toBe(cursor);
			}
		} finally {
			if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
		}
	});

	it("renders order badges next to snippet names in tree view", async () => {
		vi.resetModules();
		const mod = await import("../index.js");
		const pi = makePi();
		mod.default(pi as any);

		const openMenuHandler = (pi.registerShortcut as any).mock.calls.find(
			(c: any[]) => c[0] === "alt+s",
		)?.[1]?.handler;
		expect(openMenuHandler).toBeDefined();

		const width = 80;
		let rendererObj: any;
		const ctx = makeCtx();

		(ctx.ui.custom as any).mockImplementation((rendererFn: any) => {
			const tui = { requestRender: vi.fn(), terminal: { rows: 24 } };
			const theme = {
				fg: (_c: string, text: string) => text,
				dim: (text: string) => text,
				bold: (text: string) => text,
				accent: (text: string) => text,
				warning: (text: string) => text,
				success: (text: string) => text,
			};
			const keybindings = {};
			rendererObj = rendererFn(tui, theme, keybindings, () => {});
			return Promise.resolve(false);
		});

		await openMenuHandler(ctx);

		const contentRows = (rendererObj.render(width) as string[]).slice(3, -3);

		const snippetRows = contentRows.filter((r: string) =>
			!r.includes("▾") && !r.includes("▸") && !r.includes("↑") && !r.includes("↓") && r.trim().length > 0,
		);
		expect(snippetRows.length).toBeGreaterThan(0);

		for (const row of snippetRows) {
			expect(row).toMatch(/\[\#\d+ \· (prepend|append)\]/);
		}
	});

	it("toggles composed preview mode with p key and verifies ordered content", async () => {
		vi.resetModules();
		const mod = await import("../index.js");
		const pi = makePi();
		mod.default(pi as any);

		const openMenuHandler = (pi.registerShortcut as any).mock.calls.find(
			(c: any[]) => c[0] === "alt+s",
		)?.[1]?.handler;
		expect(openMenuHandler).toBeDefined();

		const width = 80;
		let rendererObj: any;
		const ctx = makeCtx();

		(ctx.ui.custom as any).mockImplementation((rendererFn: any) => {
			const tui = { requestRender: vi.fn(), terminal: { rows: 24 } };
			const theme = {
				fg: (_c: string, text: string) => text,
				dim: (text: string) => text,
				bold: (text: string) => text,
				accent: (text: string) => text,
				warning: (text: string) => text,
				success: (text: string) => text,
			};
			const keybindings = {};
			rendererObj = rendererFn(tui, theme, keybindings, () => {});
			return Promise.resolve(false);
		});

		await openMenuHandler(ctx);

		rendererObj.handleInput("down");
		rendererObj.handleInput(" ");
		rendererObj.handleInput("down");
		rendererObj.handleInput(" ");

		rendererObj.handleInput("p");

		const rows = rendererObj.render(width);
		const contentRows = rows.slice(3, -3);
		const content = contentRows.join("\n");

		expect(rows[1]).toContain("Composed Prompt Preview (Order Verified)");
		expect(content).toContain("[PREPEND]");
		expect(content).toContain("1. [10] session-kickoff");
		expect(content).toContain("[USER MESSAGE]");
		expect(content).toContain("[APPEND]");
		expect(content).toContain("2. [10] ask-questions");
	});
});
