/**
 * Prompt Snippets — mix-and-match single-purpose prompt rules for Pi.
 *
 * Each snippet is a markdown file with YAML frontmatter (name,
 * description, placement, order) stored in snippet directories:
 * - Extension built-ins (`snippets/`)
 * - Global user snippets (`~/.pi/agent/snippets/`)
 * - Project-level snippets (`.pi/snippets/`)
 *
 * - Press alt+s or run /snippets to open the toggle menu:
 *     ↑/↓    navigate
 *     space  toggle selection
 *     a      toggle all
 *     tab    preview snippet body
 *     enter  apply selection (also confirms from preview)
 *     esc    cancel
 * - Active snippets appear as a widget above the editor, with prepend and
 *   append groups visually distinguished.
 * - When a message is sent, active snippet bodies are prepended/appended to
 *   the message text in order (prepend group sorted by `order` first, then
 *   the typed text, then the append group sorted by `order`).
 * - Toggles reset to all-off after each send and at session start.
 */

import { existsSync, mkdirSync } from "node:fs";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import {
	BUILTIN_SNIPPETS_DIR,
	DEFAULT_ORDER,
	getSnippetDirectories,
	loadSnippets,
	normalizeNewlines,
	parseSnippet,
	transformPrompt,
	type LoadResult,
	type Placement,
	type Snippet,
} from "./core.ts";

export {
	BUILTIN_SNIPPETS_DIR,
	DEFAULT_ORDER,
	getSnippetDirectories,
	loadSnippets,
	normalizeNewlines,
	parseSnippet,
	transformPrompt,
	type LoadResult,
	type Placement,
	type Snippet,
};

export const WIDGET_ID = "prompt-snippets";

/** Rows reserved by the menu chrome (borders, title, hints) outside the scrollable content area. */
export const MENU_CHROME_ROWS = 10;
/** Minimum content rows shown in the menu, even on very short terminals. */
export const MENU_MIN_VIEW_ROWS = 5;

export default function (pi: ExtensionAPI) {
	// Snippets last seen on disk (sorted). Refreshed whenever the menu opens or a message is sent.
	let snippets: Snippet[] = [];
	// Ids of currently toggled snippets. Resets to empty after each send and at session start.
	let enabled = new Set<string>();
	// Guards against opening a second overlay while the menu is already active.
	let menuOpen = false;

	function updateWidget(ctx: ExtensionContext) {
		if (!ctx.hasUI || ctx.mode !== "tui") return;
		const active = snippets.filter((s) => enabled.has(s.id));
		const prepends = active.filter((s) => s.placement === "prepend");
		const appends = active.filter((s) => s.placement === "append");

		if (prepends.length === 0 && appends.length === 0) {
			ctx.ui.setWidget(WIDGET_ID, undefined);
			return;
		}

		const theme = ctx.ui.theme;
		const lines: string[] = [];
		if (prepends.length > 0) {
			lines.push(theme.fg("accent", `↑ prepend: ${prepends.map((s) => s.name).join(" · ")}`));
		}
		if (appends.length > 0) {
			lines.push(theme.fg("warning", `↓ append: ${appends.map((s) => s.name).join(" · ")}`));
		}
		ctx.ui.setWidget(WIDGET_ID, lines);
	}

	/**
	 * Reloads snippets from disk and drops enabled ids for snippets that no
	 * longer exist. Optionally warns the user about files that failed to parse.
	 */
	function refresh(ctx: ExtensionContext, notifyFailures: boolean): LoadResult {
		const result = loadSnippets();
		snippets = result.snippets;
		enabled = new Set([...enabled].filter((id) => snippets.some((s) => s.id === id)));
		if (notifyFailures && result.failed.length > 0 && ctx.hasUI) {
			ctx.ui.notify(
				`${result.failed.length} snippet file(s) skipped (invalid frontmatter or empty body): ${result.failed.join(", ")}`,
				"warning",
			);
		}
		return result;
	}

	async function openMenu(ctx: ExtensionContext) {
		if (ctx.mode !== "tui") {
			ctx.ui.notify("Snippet menu requires interactive mode", "warning");
			return;
		}
		if (menuOpen) return;
		menuOpen = true;

		try {
			refresh(ctx, true);

			if (snippets.length === 0) {
				ctx.ui.notify(`No snippets found in configured snippet directories`, "warning");
				updateWidget(ctx);
				return;
			}

			// Working copy; only committed to `enabled` on confirm.
			const working = new Set(enabled);

			const confirmed = await ctx.ui.custom<boolean>((tui, theme, _keybindings, done) => {
				const prepends = snippets.filter((s) => s.placement === "prepend");
				const appends = snippets.filter((s) => s.placement === "append");
				const items = [...prepends, ...appends];

				let mode: "list" | "preview" = "list";
				let cursor = 0;
				let listScroll = 0;
				let previewScroll = 0;

				const moveCursor = (delta: number) => {
					if (items.length === 0) return;
					cursor = (cursor + delta + items.length) % items.length;
				};

				const toggleAll = () => {
					if (items.length === 0) return;
					const allEnabled = items.every((s) => working.has(s.id));
					for (const item of items) {
						if (allEnabled) working.delete(item.id);
						else working.add(item.id);
					}
				};

				const itemRow = (snippet: Snippet, idx: number, width: number): string => {
					const pointer = idx === cursor ? theme.fg("accent", "> ") : "  ";
					const checkbox = working.has(snippet.id) ? theme.fg("success", "[x]") : theme.fg("dim", "[ ]");
					const desc = snippet.description ? theme.fg("dim", ` — ${snippet.description}`) : "";
					return truncateToWidth(`${pointer}${checkbox} ${theme.bold(snippet.name)}${desc}`, width);
				};

				/** List rows with the item index each row corresponds to (null for headers/blanks). */
				const buildListRows = (width: number): { text: string; itemIndex: number | null }[] => {
					const rows: { text: string; itemIndex: number | null }[] = [];
					rows.push({ text: theme.fg("dim", "↑ PREPEND — added before your message"), itemIndex: null });
					if (prepends.length === 0) rows.push({ text: theme.fg("dim", "  (none)"), itemIndex: null });
					prepends.forEach((s, i) => rows.push({ text: itemRow(s, i, width), itemIndex: i }));
					rows.push({ text: "", itemIndex: null });
					rows.push({ text: theme.fg("dim", "↓ APPEND — added after your message"), itemIndex: null });
					if (appends.length === 0) rows.push({ text: theme.fg("dim", "  (none)"), itemIndex: null });
					appends.forEach((s, i) =>
						rows.push({ text: itemRow(s, prepends.length + i, width), itemIndex: prepends.length + i }),
					);
					return rows;
				};

				const buildPreviewRows = (snippet: Snippet, width: number): string[] => {
					const rows: string[] = [];
					rows.push(truncateToWidth(theme.bold(snippet.name), width));
					rows.push(
						truncateToWidth(theme.fg("dim", `${snippet.placement} · order ${snippet.order} · ${snippet.id}`), width),
					);
					rows.push(theme.fg("dim", "─".repeat(Math.min(width, 40))));
					for (const line of snippet.body.split("\n")) {
						if (line.length === 0) {
							rows.push("");
							continue;
						}
						for (const wrapped of wrapTextWithAnsi(line, width)) {
							rows.push(truncateToWidth(wrapped, width));
						}
					}
					return rows;
				};

				/**
				 * Slices `lines` to a scrollable viewport of at most `maxView` lines,
				 * reserving indicator slots when clipped. Returns the visible lines
				 * plus the clamped scroll position. When `focusRow` is given, scrolls
				 * so it stays visible.
				 */
				const viewport = (
					lines: string[],
					scroll: number,
					maxView: number,
					focusRow?: number,
				): { out: string[]; scroll: number } => {
					const clipped = lines.length > maxView;
					const view = clipped ? Math.max(1, maxView - 2) : maxView;

					let s = Math.min(Math.max(0, scroll), Math.max(0, lines.length - view));
					if (focusRow !== undefined) {
						if (focusRow < s) s = focusRow;
						else if (focusRow >= s + view) s = focusRow - view + 1;
					}

					const visible = lines.slice(s, s + view);
					if (!clipped) return { out: visible, scroll: s };

					const above = s;
					const below = lines.length - (s + view);
					return {
						out: [
							above > 0 ? theme.fg("dim", `  ↑ ${above} more`) : "",
							...visible,
							below > 0 ? theme.fg("dim", `  ↓ ${below} more`) : "",
						],
						scroll: s,
					};
				};

				return {
					render(width: number): string[] {
						const maxView = Math.max(MENU_MIN_VIEW_ROWS, tui.terminal.rows - MENU_CHROME_ROWS);

						let content: string[];
						let title: string;
						let hints: string;
						if (mode === "list") {
							const rows = buildListRows(width);
							const cursorRow = rows.findIndex((r) => r.itemIndex === cursor);
							const v = viewport(
								rows.map((r) => r.text),
								listScroll,
								maxView,
								cursorRow >= 0 ? cursorRow : undefined,
							);
							content = v.out;
							listScroll = v.scroll;
							title = "Prompt snippets";
							hints = "↑↓ navigate • space toggle • a toggle all • tab preview • enter apply • esc cancel";
						} else {
							const snippet = items[cursor];
							const rows = buildPreviewRows(snippet, width);
							const v = viewport(rows, previewScroll, maxView);
							content = v.out;
							previewScroll = v.scroll;
							title = `Preview: ${snippet.name}`;
							hints = "↑↓ scroll • enter apply • tab/esc back";
						}

						return [
							theme.fg("accent", "─".repeat(width)),
							truncateToWidth(` ${theme.fg("accent", theme.bold(title))}`, width),
							"",
							...content,
							"",
							truncateToWidth(theme.fg("dim", ` ${hints}`), width),
							theme.fg("accent", "─".repeat(width)),
						];
					},
					invalidate() {},
					handleInput(data: string) {
						if (mode === "list") {
							if (matchesKey(data, Key.up)) {
								moveCursor(-1);
								tui.requestRender();
							} else if (matchesKey(data, Key.down)) {
								moveCursor(1);
								tui.requestRender();
							} else if (matchesKey(data, Key.space)) {
								if (items.length === 0) return;
								const id = items[cursor].id;
								if (working.has(id)) working.delete(id);
								else working.add(id);
								tui.requestRender();
							} else if (data === "a" || data === "A") {
								toggleAll();
								tui.requestRender();
							} else if (matchesKey(data, Key.tab)) {
								if (items.length === 0) return;
								mode = "preview";
								previewScroll = 0;
								tui.requestRender();
							} else if (matchesKey(data, Key.enter)) {
								done(true);
							} else if (matchesKey(data, Key.escape)) {
								done(false);
							}
						} else {
							if (matchesKey(data, Key.up)) {
								previewScroll--;
								tui.requestRender();
							} else if (matchesKey(data, Key.down)) {
								previewScroll++;
								tui.requestRender();
							} else if (matchesKey(data, Key.enter)) {
								done(true);
							} else if (matchesKey(data, Key.tab) || matchesKey(data, Key.escape)) {
								mode = "list";
								tui.requestRender();
							}
						}
					},
				};
			});

			if (confirmed) enabled = working;
			updateWidget(ctx);
		} finally {
			menuOpen = false;
		}
	}

	pi.on("session_start", (_event, ctx) => {
		enabled = new Set();
		try {
			if (!existsSync(BUILTIN_SNIPPETS_DIR)) mkdirSync(BUILTIN_SNIPPETS_DIR, { recursive: true });
		} catch {
			// Non-fatal: the menu will simply report "no snippets found" if the directory is unusable.
		}
		refresh(ctx, false);
		updateWidget(ctx);
	});

	pi.on("input", async (event, ctx) => {
		if (enabled.size === 0) return; // continue unchanged

		refresh(ctx, false);
		const active = snippets.filter((s) => enabled.has(s.id));
		enabled = new Set();
		updateWidget(ctx);

		if (active.length === 0) return; // all toggled snippets vanished from disk

		return {
			action: "transform",
			text: transformPrompt(event.text, active),
		};
	});

	pi.registerShortcut("alt+s", {
		description: "Toggle prompt snippets",
		handler: async (ctx) => {
			await openMenu(ctx);
		},
	});

	pi.registerCommand("snippets", {
		description: "Open the prompt snippet toggle menu",
		handler: async (_args, ctx) => {
			await openMenu(ctx);
		},
	});
}
