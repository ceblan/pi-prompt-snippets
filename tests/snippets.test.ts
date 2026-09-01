import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	BUILTIN_SNIPPETS_DIR,
	DEFAULT_ORDER,
	getSnippetDirectories,
	loadSnippets,
	normalizeNewlines,
	parseSnippet,
	transformPrompt,
	type Snippet,
} from "../core.ts";

describe("Prompt Snippets Test Suite", () => {
	describe("1. Newline Normalization", () => {
		it("should normalize Windows CRLF to LF", () => {
			const input = "foo\r\nbar\r\nbaz\r\n";
			const expected = "foo\nbar\nbaz\n";
			assert.strictEqual(normalizeNewlines(input), expected);
		});

		it("should preserve standard LF newlines", () => {
			const input = "foo\nbar\nbaz\n";
			assert.strictEqual(normalizeNewlines(input), input);
		});

		it("should handle mixed CRLF and LF newlines", () => {
			const input = "foo\r\nbar\nbaz\r\n";
			const expected = "foo\nbar\nbaz\n";
			assert.strictEqual(normalizeNewlines(input), expected);
		});
	});

	describe("2. Snippet Parsing & Frontmatter", () => {
		it("should parse valid snippet with all frontmatter fields", () => {
			const raw = `---
name: Code Review
description: Reviews code thoroughly
placement: prepend
order: 2
---
Always review code before submitting.`;

			const snippet = parseSnippet("review.md", raw);
			assert.ok(snippet);
			assert.strictEqual(snippet.id, "review.md");
			assert.strictEqual(snippet.name, "Code Review");
			assert.strictEqual(snippet.description, "Reviews code thoroughly");
			assert.strictEqual(snippet.placement, "prepend");
			assert.strictEqual(snippet.order, 2);
			assert.strictEqual(snippet.body, "Always review code before submitting.");
		});

		it("should apply sensible defaults for optional fields", () => {
			const raw = `---
---
Just the body content.`;

			const snippet = parseSnippet("my-tool.md", raw);
			assert.ok(snippet);
			assert.strictEqual(snippet.id, "my-tool.md");
			assert.strictEqual(snippet.name, "my-tool");
			assert.strictEqual(snippet.description, "");
			assert.strictEqual(snippet.placement, "append");
			assert.strictEqual(snippet.order, DEFAULT_ORDER);
			assert.strictEqual(snippet.body, "Just the body content.");
		});

		it("should unquote matching single and double quoted values", () => {
			const raw = `---
name: "Quoted Name"
description: 'Quoted Description'
order: '4.5'
---
Body text.`;

			const snippet = parseSnippet("quoted.md", raw);
			assert.ok(snippet);
			assert.strictEqual(snippet.name, "Quoted Name");
			assert.strictEqual(snippet.description, "Quoted Description");
			assert.strictEqual(snippet.order, 4.5);
		});

		it("should handle mismatched quotes without stripping", () => {
			const raw = `---
name: "Mismatched'
---
Body text.`;

			const snippet = parseSnippet("mismatch.md", raw);
			assert.ok(snippet);
			assert.strictEqual(snippet.name, `"Mismatched'`);
		});

		it("should handle case-insensitive frontmatter keys", () => {
			const raw = `---
NAME: Upper Case Name
DESCRIPTION: Upper Case Description
PLACEMENT: prepend
ORDER: 7
---
Body text.`;

			const snippet = parseSnippet("case.md", raw);
			assert.ok(snippet);
			assert.strictEqual(snippet.name, "Upper Case Name");
			assert.strictEqual(snippet.description, "Upper Case Description");
			assert.strictEqual(snippet.placement, "prepend");
			assert.strictEqual(snippet.order, 7);
		});

		it("should return null for invalid or missing frontmatter delimiter", () => {
			const invalid = `name: No Frontmatter
body without dashes`;

			assert.strictEqual(parseSnippet("bad.md", invalid), null);
		});

		it("should return null for empty body", () => {
			const emptyBody = `---
name: Empty
description: No body here
---
`;

			assert.strictEqual(parseSnippet("empty.md", emptyBody), null);
		});

		it("should return null for whitespace-only body", () => {
			const whitespaceBody = `---
name: Whitespace
---
   \n\t  \n  `;

			assert.strictEqual(parseSnippet("whitespace.md", whitespaceBody), null);
		});
	});

	describe("3. Directory Hierarchy & Loading", () => {
		it("should compute default snippet directory hierarchy", () => {
			const dirs = getSnippetDirectories("/tmp/test-project", "/tmp/test-home");
			assert.ok(dirs.length >= 2);
			assert.strictEqual(dirs[0], BUILTIN_SNIPPETS_DIR);
			assert.strictEqual(dirs[1], join("/tmp/test-home", ".pi", "agent", "snippets"));
			assert.strictEqual(dirs[2], join("/tmp/test-project", ".pi", "snippets"));
		});

		it("should handle non-existent directories gracefully", () => {
			const result = loadSnippets(["/non/existent/directory/path/12345"]);
			assert.strictEqual(result.snippets.length, 0);
			assert.strictEqual(result.failed.length, 0);
		});

		it("should load and sort snippets by placement (prepend first, append last) and order", () => {
			const tempDir = mkdtempSync(join(tmpdir(), "snippets-test-"));

			try {
				writeFileSync(
					join(tempDir, "b-append.md"),
					`---
name: Append B
placement: append
order: 20
---
Append B body`,
				);

				writeFileSync(
					join(tempDir, "a-append.md"),
					`---
name: Append A
placement: append
order: 10
---
Append A body`,
				);

				writeFileSync(
					join(tempDir, "p2-prepend.md"),
					`---
name: Prepend 2
placement: prepend
order: 5
---
Prepend 2 body`,
				);

				writeFileSync(
					join(tempDir, "p1-prepend.md"),
					`---
name: Prepend 1
placement: prepend
order: 1
---
Prepend 1 body`,
				);

				const result = loadSnippets([tempDir]);
				assert.strictEqual(result.failed.length, 0);
				assert.strictEqual(result.snippets.length, 4);

				assert.strictEqual(result.snippets[0].name, "Prepend 1");
				assert.strictEqual(result.snippets[1].name, "Prepend 2");
				assert.strictEqual(result.snippets[2].name, "Append A");
				assert.strictEqual(result.snippets[3].name, "Append B");
			} finally {
				rmSync(tempDir, { recursive: true, force: true });
			}
		});

		it("should sort alphabetically when order values are equal", () => {
			const tempDir = mkdtempSync(join(tmpdir(), "snippets-sort-"));

			try {
				writeFileSync(
					join(tempDir, "z-snippet.md"),
					`---
name: Zebra
placement: prepend
order: 5
---
Zebra body`,
				);

				writeFileSync(
					join(tempDir, "a-snippet.md"),
					`---
name: Alpha
placement: prepend
order: 5
---
Alpha body`,
				);

				const result = loadSnippets([tempDir]);
				assert.strictEqual(result.snippets.length, 2);
				assert.strictEqual(result.snippets[0].name, "Alpha");
				assert.strictEqual(result.snippets[1].name, "Zebra");
			} finally {
				rmSync(tempDir, { recursive: true, force: true });
			}
		});

		it("should ignore non-markdown files and subdirectories", () => {
			const tempDir = mkdtempSync(join(tmpdir(), "snippets-ignore-"));

			try {
				mkdirSync(join(tempDir, "nested-folder"));
				writeFileSync(join(tempDir, "nested-folder", "sub.md"), "---\nname: Sub\n---\nBody");
				writeFileSync(join(tempDir, "ignore.txt"), "Not markdown");
				writeFileSync(join(tempDir, "ignore.json"), "{}");
				writeFileSync(
					join(tempDir, "valid.md"),
					`---
name: Valid
placement: prepend
---
Valid markdown`,
				);

				const result = loadSnippets([tempDir]);
				assert.strictEqual(result.snippets.length, 1);
				assert.strictEqual(result.snippets[0].name, "Valid");
				assert.strictEqual(result.failed.length, 0);
			} finally {
				rmSync(tempDir, { recursive: true, force: true });
			}
		});

		it("should override lower-priority snippets when filename matches in higher-priority dir", () => {
			const baseDir = mkdtempSync(join(tmpdir(), "snippets-base-"));
			const userDir = mkdtempSync(join(tmpdir(), "snippets-user-"));

			try {
				writeFileSync(
					join(baseDir, "custom.md"),
					`---
name: Base Custom
placement: prepend
order: 10
---
Base version body`,
				);

				writeFileSync(
					join(userDir, "custom.md"),
					`---
name: User Override Custom
placement: prepend
order: 5
---
User override body`,
				);

				const result = loadSnippets([baseDir, userDir]);
				assert.strictEqual(result.snippets.length, 1);
				assert.strictEqual(result.snippets[0].name, "User Override Custom");
				assert.strictEqual(result.snippets[0].body, "User override body");
				assert.strictEqual(result.snippets[0].order, 5);
			} finally {
				rmSync(baseDir, { recursive: true, force: true });
				rmSync(userDir, { recursive: true, force: true });
			}
		});

		it("should track invalid snippet files in failed list", () => {
			const tempDir = mkdtempSync(join(tmpdir(), "snippets-fail-"));

			try {
				writeFileSync(join(tempDir, "broken.md"), "Not a valid frontmatter markdown");
				writeFileSync(
					join(tempDir, "valid.md"),
					`---
name: Valid
placement: append
---
Valid content`,
				);

				const result = loadSnippets([tempDir]);
				assert.strictEqual(result.snippets.length, 1);
				assert.strictEqual(result.snippets[0].name, "Valid");
				assert.strictEqual(result.failed.length, 1);
				assert.strictEqual(result.failed[0], "broken.md");
			} finally {
				rmSync(tempDir, { recursive: true, force: true });
			}
		});
	});

	describe("4. Prompt Transformation", () => {
		const s1: Snippet = {
			id: "s1.md",
			name: "Prepend Rule 1",
			description: "",
			placement: "prepend",
			order: 1,
			body: "[PREPEND RULE 1]",
		};

		const s2: Snippet = {
			id: "s2.md",
			name: "Prepend Rule 2",
			description: "",
			placement: "prepend",
			order: 2,
			body: "[PREPEND RULE 2]",
		};

		const s3: Snippet = {
			id: "s3.md",
			name: "Append Rule 1",
			description: "",
			placement: "append",
			order: 1,
			body: "[APPEND RULE 1]",
		};

		it("should wrap user prompt with prepend and append snippets", () => {
			const prompt = "Please refactor this function.";
			const transformed = transformPrompt(prompt, [s1, s2, s3]);
			const expected = `[PREPEND RULE 1]

[PREPEND RULE 2]

Please refactor this function.

[APPEND RULE 1]`;

			assert.strictEqual(transformed, expected);
		});

		it("should handle only prepend snippets", () => {
			const prompt = "Hello world";
			const transformed = transformPrompt(prompt, [s1]);
			assert.strictEqual(transformed, `[PREPEND RULE 1]\n\nHello world`);
		});

		it("should handle only append snippets", () => {
			const prompt = "Hello world";
			const transformed = transformPrompt(prompt, [s3]);
			assert.strictEqual(transformed, `Hello world\n\n[APPEND RULE 1]`);
		});

		it("should handle empty prompt text", () => {
			const transformed = transformPrompt("", [s1, s3]);
			assert.strictEqual(transformed, `[PREPEND RULE 1]\n\n[APPEND RULE 1]`);
		});

		it("should return raw prompt text when active snippet list is empty", () => {
			const prompt = "No snippets active";
			const transformed = transformPrompt(prompt, []);
			assert.strictEqual(transformed, prompt);
		});
	});

	describe("5. Built-in Snippets Verification", () => {
		it("should successfully load and validate all built-in snippet markdown files", () => {
			const result = loadSnippets([BUILTIN_SNIPPETS_DIR]);
			assert.strictEqual(result.failed.length, 0, `Failed files: ${result.failed.join(", ")}`);
			assert.ok(result.snippets.length >= 15, `Expected >=15 snippets, got ${result.snippets.length}`);

			for (const s of result.snippets) {
				assert.ok(s.id.endsWith(".md"), `Snippet ${s.id} should have .md extension`);
				assert.ok(s.name.length > 0, `Snippet ${s.id} should have a name`);
				assert.ok(s.body.length > 0, `Snippet ${s.id} should have a non-empty body`);
				assert.ok(
					s.placement === "prepend" || s.placement === "append",
					`Snippet ${s.id} should have valid placement`,
				);
				assert.ok(Number.isFinite(s.order), `Snippet ${s.id} should have finite order`);
			}
		});
	});
});
