# Prompt Snippets

Architecture and design of the pi-prompt-snippets extension: composable, single-purpose prompt rules injected into messages before they reach the model.

Built-in snippets in `snippets/` are authored in Spanish (frontmatter `name`/`description` and body) because the user composes prompts in Spanish — mixed-language injections confuse the model. Technical terms, tool names (`todo`), and commands (`notify-send`) stay in English.

## Files

Other documents in this knowledge graph.

- [[last-commit]] — last tracked commit for documentation sync

## Snippet Loading

Snippets are markdown files with YAML frontmatter loaded from three directories in priority order, where higher-priority files override lower-priority ones by filename. See [[core.ts#parseSnippet]] for the frontmatter contract and [[core.ts#getSnippetDirectories]] for directory resolution.

### Snippet Directories

Resolution order (highest first): `<cwd>/.pi/snippets/` → `~/.pi/agent/snippets/` → extension built-ins (`snippets/`). Implemented in [[core.ts#getSnippetDirectories]].

### Prompt Transformation

On send, active snippet bodies wrap the typed text: `prepend` group (sorted by `order`) → typed text → `append` group (sorted by `order`). Implemented in [[core.ts#transformPrompt]].

## Toggle Menu

The interactive TUI menu shows two independent tabs (PREPEND / APPEND) with per-tab fuzzy search, remembered cursor/scroll, and enter apply. Opened via the `/snippets` command or the configured global shortcut. Implemented in [[index.ts]] `openMenu`.

Each tab keeps its own query, search focus, cursor, and scroll ([[index.ts]] `TabState`); the `working` selection set is shared so a final enter commits both tabs at once. The tab bar renders `↑ PREPEND (n)` / `↓ APPEND (n)` counters (selected in that tab) with the active tab inverted via `theme.bg("selectedBg", …)` and the inactive one dim.

Keybindings: `tab`/`shift+tab`/`h`/`l`/`←`/`→` switch tabs (only when not searching — in search mode `h`/`l` type); `/` opens the per-tab search (pi-tui `Input`, prompt `/`); `enter` confirms the search or applies the selection; `esc` clears the search or closes the menu; `↑/↓` move the cursor (also from search, defocusing the input); `space` toggles; `a` toggles all visible items of the tab; `p` previews the snippet body (`p`/`tab`/`esc` return to the list; tab does not switch tabs from preview).

The search line row is always rendered (empty when idle) so the layout never jumps; `MENU_CHROME_ROWS = 11` reserves borders, title, tab bar, search line, and footer. Rows truncate with `…`, and fuzzy-matched name characters are accented before truncation (ANSI-safe order: highlight → truncate). Selected snippets that do not match the query stay visible in place with a dim name; empty groups show `(none)` and empty filters show `(no matches)`.

### Fuzzy Filtering

Tab filtering lives in [[core.ts#visibleSnippets]]: fuzzy matches on `name + " " + description` (pi-tui `fuzzyMatch`) plus every selected id, in stable input order.

[[core.ts#fuzzyMatchIndices]] is the position-aware greedy case-insensitive matcher used to accent matched name characters — pi-tui's `fuzzyMatch` does not expose positions, so highlighting needs its own sweep that reports which characters were consumed.

## Shortcut Configuration

The toggle shortcut is user-configurable so other extensions can keep their own keys. Read from `~/.pi/agent/prompt-snippets.json` by [[core.ts#loadShortcutKey]]; missing/invalid config falls back to `DEFAULT_SHORTCUT`.

Directory resolution honors pi env overrides via [[core.ts#getPiConfigDir]] (`PI_CODING_AGENT_DIR` / `XDG_CONFIG_HOME`). Not hardcoded to `alt+s` because pi-powerline-footer reserves that key for its editor-text stash with no configuration for it (only `stashHistory` — the history picker — is configurable, not the stash toggle).

## Tests

The test suite covers parsing, loading, transformation, fuzzy menu filtering, and shortcut config using `node:test` and temporary directories to avoid touching real snippet paths.

### Newline Normalization

Windows CRLF sequences are converted to LF before parsing so frontmatter delimiters match consistently across platforms.

### Frontmatter Parsing

Validates that `parseSnippet` extracts fields, applies defaults, strips quotes, handles case-insensitive keys, and rejects invalid or empty files.

### Directory Loading

Verifies `loadSnippets` sorts prepend-first then append-last, ignores non-markdown entries, overrides by filename priority, and tracks unparsable files.

### Prompt Transformation

Checks that `transformPrompt` wraps the user's typed text with active prepend and append snippet bodies in the correct order, including the edge case of an empty prompt.

### Menu Fuzzy Filtering

Verifies [[core.ts#visibleSnippets]]: empty/whitespace queries return the full group, name and description both filter, selected ids stay visible without matching, order is stable, and no-match queries with nothing selected return an empty list.

### Fuzzy Match Indices

Verifies [[core.ts#fuzzyMatchIndices]]: complete matches return ordered greedy indices, incomplete matches return `null`, matching is case-insensitive, and empty/whitespace queries consume no characters.

### Shortcut Configuration

Ensures `loadShortcutKey` reads the shortcut from `prompt-snippets.json` and falls back to `DEFAULT_SHORTCUT` when the file is missing, contains invalid JSON, or holds a non-string shortcut value.
