/**
 * Core engine for Prompt Snippets — parsing, validation, multi-directory loading,
 * and prompt transformation.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Where a snippet's body is injected relative to the user's typed message. */
export type Placement = "prepend" | "append";

export interface Snippet {
	/** Filename on disk, e.g. "concise.md"; used as a stable unique id. */
	id: string;
	name: string;
	description: string;
	placement: Placement;
	order: number;
	body: string;
	sourceDir?: string;
}

const extensionDir = dirname(fileURLToPath(import.meta.url));
export const BUILTIN_SNIPPETS_DIR = join(extensionDir, "snippets");

/** Fallback sort order for snippets with a missing/invalid `order` field. */
export const DEFAULT_ORDER = 9999;

/** Normalizes Windows-style CRLF line endings to LF `\n`. */
export function normalizeNewlines(text: string): string {
	return text.replace(/\r\n/g, "\n");
}

/**
 * Returns candidate snippet directories in priority order:
 * 1. Extension built-ins (`<extensionDir>/snippets`)
 * 2. User-level snippets (`~/.pi/agent/snippets`)
 * 3. Workspace-level snippets (`<cwd>/.pi/snippets`)
 */
export function getSnippetDirectories(cwd = process.cwd(), home = homedir()): string[] {
	const dirs: string[] = [BUILTIN_SNIPPETS_DIR];

	const userSnippets = join(home, ".pi", "agent", "snippets");
	if (userSnippets !== BUILTIN_SNIPPETS_DIR) {
		dirs.push(userSnippets);
	}

	const projectSnippets = join(cwd, ".pi", "snippets");
	if (projectSnippets !== BUILTIN_SNIPPETS_DIR && projectSnippets !== userSnippets) {
		dirs.push(projectSnippets);
	}

	return dirs;
}

/**
 * Parses a snippet file's frontmatter and body.
 * Returns `null` if the file has no valid frontmatter block or an empty body.
 */
export function parseSnippet(filename: string, raw: string, sourceDir?: string): Snippet | null {
	const text = normalizeNewlines(raw);
	const match = text.match(/^---(?:\n([\s\S]*?))?\n---\n?([\s\S]*)$/);
	if (!match) return null;

	const meta: Record<string, string> = {};
	if (match[1]) {
		for (const line of match[1].split("\n")) {
			const kv = line.match(/^([A-Za-z][\w-]*)\s*:\s*(.*)$/);
			if (!kv) continue;
			// Strip matching quote pairs, e.g. "value" or 'value'.
			meta[kv[1].toLowerCase()] = kv[2].trim().replace(/^(["'])([\s\S]*)\1$/, "$2");
		}
	}

	const body = match[2].trim();
	if (!body) return null;

	const parsedOrder = Number.parseFloat(meta.order ?? "");
	return {
		id: filename,
		name: meta.name || filename.replace(/\.md$/i, ""),
		description: meta.description ?? "",
		placement: meta.placement === "prepend" ? "prepend" : "append",
		order: Number.isFinite(parsedOrder) ? parsedOrder : DEFAULT_ORDER,
		body,
		sourceDir,
	};
}

/** Result of a `loadSnippets()` call, including any files that failed to load. */
export interface LoadResult {
	snippets: Snippet[];
	/** Filenames that existed but could not be read or parsed. */
	failed: string[];
}

/**
 * Loads all snippets from target directories, sorted: prepend group first, append group last, each by (order, name).
 * When multiple directories contain a snippet with the same filename, higher priority directories override lower ones.
 */
export function loadSnippets(dirs?: string[]): LoadResult {
	const targetDirs = dirs ?? getSnippetDirectories();
	const snippetMap = new Map<string, Snippet>();
	const failed: string[] = [];

	for (const dir of targetDirs) {
		if (!existsSync(dir)) continue;

		let entries: string[] = [];
		try {
			entries = readdirSync(dir, { withFileTypes: true })
				.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"))
				.map((entry) => entry.name);
		} catch {
			// Directory became unreadable between the existsSync check and now; treat as empty.
			continue;
		}

		for (const file of entries) {
			try {
				const fullPath = join(dir, file);
				const content = readFileSync(fullPath, "utf8");
				const snippet = parseSnippet(file, content, dir);
				if (snippet) {
					snippetMap.set(file, snippet);
				} else {
					failed.push(file);
				}
			} catch {
				failed.push(file);
			}
		}
	}

	const byOrder = (a: Snippet, b: Snippet) => a.order - b.order || a.name.localeCompare(b.name);
	const allSnippets = Array.from(snippetMap.values());
	const sorted = [
		...allSnippets.filter((s) => s.placement === "prepend").sort(byOrder),
		...allSnippets.filter((s) => s.placement === "append").sort(byOrder),
	];
	return { snippets: sorted, failed };
}

/** Injects active snippets around user prompt text. */
export function transformPrompt(text: string, activeSnippets: Snippet[]): string {
	const prependBodies = activeSnippets.filter((s) => s.placement === "prepend").map((s) => s.body);
	const appendBodies = activeSnippets.filter((s) => s.placement === "append").map((s) => s.body);

	const parts: string[] = [];
	if (prependBodies.length > 0) parts.push(...prependBodies);
	if (text.trim().length > 0) parts.push(text);
	if (appendBodies.length > 0) parts.push(...appendBodies);

	return parts.join("\n\n");
}
