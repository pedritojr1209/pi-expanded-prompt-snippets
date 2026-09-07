export interface Snippet {
	id: string;
	filePath: string;
	name: string;
	description: string;
	placement: "prepend" | "append";
	order: number;
	main: boolean;
	body: string;
}
