declare module "@earendil-works/pi-coding-agent" {
	export interface ExtensionAPI {
		on(event: string, handler: (event: any, ctx: ExtensionContext) => void): void;
		registerShortcut(key: string, config: { description: string; handler: (ctx: ExtensionContext) => void }): void;
		registerCommand(name: string, config: { description: string; handler: (args: any, ctx: ExtensionContext) => void }): void;
	}

	export interface ExtensionContext {
		hasUI: boolean;
		mode: string;
		ui: {
			setWidget(id: string, lines?: string[]): void;
			notify(message: string, type?: string): void;
			custom<T>(renderer: (tui: any, theme: any, keybindings: any, done: (result: T) => void) => { render: (width: number) => string[]; invalidate: () => void; handleInput: (data: string) => void }): Promise<T>;
			theme: {
				fg(color: string, text: string): string;
				dim?(text: string): string;
				bold(text: string): string;
				accent(text: string): string;
				warning(text: string): string;
				success(text: string): string;
			};
		};
	}
}

declare module "@earendil-works/pi-tui" {
	export const Key: {
		up: string;
		down: string;
		left: string;
		right: string;
		space: string;
		tab: string;
		enter: string;
		escape: string;
	};

	export function matchesKey(data: string, key: string): boolean;
	export function truncateToWidth(text: string, width: number): string;
	export function wrapTextWithAnsi(text: string, width: number): string[];
}
