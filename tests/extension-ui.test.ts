import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, it } from "node:test";
import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";

type BlockedState = { kind: string; message: string };
type CustomOptions = { overlay?: boolean; blocked?: BlockedState };
type MenuComponent = {
	render(width: number): string[];
	handleInput(data: string): void;
};
type CustomFactory = (
	tui: unknown,
	theme: unknown,
	keybindings: unknown,
	done: (result: boolean) => void,
) => MenuComponent | Promise<MenuComponent>;

const EXPECTED_OPTIONS: CustomOptions = {
	blocked: { kind: "question", message: "Prompt snippet selection is waiting for user input" },
};
const ANSI_PATTERN = /\u001b\[[0-?]*[ -/]*[@-~]/g;

async function waitFor(predicate: () => boolean, description: string): Promise<void> {
	const deadline = Date.now() + 2_000;
	while (!predicate()) {
		if (Date.now() >= deadline) assert.fail(`Timed out waiting for ${description}`);
		await new Promise((resolveDelay) => setTimeout(resolveDelay, 5));
	}
}

async function createMenuHarness() {
	const projectRoot = fileURLToPath(new URL("../", import.meta.url));
	const hostModules = resolve(process.env.PI_SNIPPETS_TEST_HOST_MODULES ?? join(projectRoot, "node_modules"));
	const hostAgentRoot = join(hostModules, "@earendil-works", "pi-coding-agent");
	const hostVersion = JSON.parse(readFileSync(join(hostAgentRoot, "package.json"), "utf8")).version as string;
	const [major, minor] = hostVersion.split(".").map(Number);
	const supportsBlocked = major > 1 || (major === 1 && minor >= 5);

	const previousCwd = process.cwd();
	const envNames = ["HOME", "PI_CODING_AGENT_DIR", "XDG_CONFIG_HOME"] as const;
	const previousEnv = new Map(envNames.map((name) => [name, process.env[name]]));
	const temporaryRoot = mkdtempSync(join(tmpdir(), "snippets-extension-ui-"));
	let restored = false;
	const restore = () => {
		if (restored) return;
		restored = true;
		process.chdir(previousCwd);
		for (const name of envNames) {
			const value = previousEnv.get(name);
			if (value === undefined) delete process.env[name];
			else process.env[name] = value;
		}
		rmSync(temporaryRoot, { recursive: true, force: true });
	};

	try {
		const projectSnippets = join(temporaryRoot, ".pi", "snippets");
		mkdirSync(projectSnippets, { recursive: true });
		mkdirSync(join(temporaryRoot, "home"), { recursive: true });
		mkdirSync(join(temporaryRoot, "agent"), { recursive: true });
		mkdirSync(join(temporaryRoot, "config"), { recursive: true });
		writeFileSync(
			join(projectSnippets, "round2-alpha.md"),
			"---\nname: Round2 Alpha\ndescription: unique alpha fixture\nplacement: prepend\norder: 1\n---\n[ROUND2 PREPEND]",
		);
		writeFileSync(
			join(projectSnippets, "round2-beta.md"),
			"---\nname: Round2 Beta\ndescription: unique beta fixture\nplacement: append\norder: 1\n---\n[ROUND2 APPEND]",
		);
		writeFileSync(
			join(projectSnippets, "round2-unrelated.md"),
			"---\nname: Unrelated Project\ndescription: must stay filtered\nplacement: prepend\norder: 2\n---\n[UNRELATED]",
		);

		process.chdir(temporaryRoot);
		process.env.HOME = join(temporaryRoot, "home");
		process.env.PI_CODING_AGENT_DIR = join(temporaryRoot, "agent");
		process.env.XDG_CONFIG_HOME = join(temporaryRoot, "config");

		const importHost = (relativePath: string) => import(pathToFileURL(join(hostAgentRoot, relativePath)).href);
		const [{ loadExtensions }, { ExtensionRunner }, { InteractiveMode }, { initTheme }] = await Promise.all([
			importHost("dist/core/extensions/loader.js"),
			importHost("dist/core/extensions/runner.js"),
			importHost("dist/modes/interactive/interactive-mode.js"),
			importHost("dist/modes/interactive/theme/theme.js"),
		]);
		initTheme("dark", false);
		const loaded = await loadExtensions([join(projectRoot, "index.ts")], temporaryRoot);
		assert.deepEqual(loaded.errors, [], `The real extension must load under Pi ${hostVersion}`);
		assert.equal(loaded.extensions.length, 1);

		const runner = new ExtensionRunner(loaded.extensions, loaded.runtime, temporaryRoot, {}, {});
		const extensionErrors: unknown[] = [];
		runner.onError((error: unknown) => extensionErrors.push(error));

		let activeComponent: MenuComponent | undefined;
		let activeBlocked: BlockedState | undefined;
		let editorText = "preserve this draft";
		const customOptions: Array<CustomOptions | undefined> = [];
		const widgetHistory: Array<string[] | undefined> = [];
		const notifications: string[] = [];
		const editor = {
			getText: () => editorText,
			setText: (value: string) => {
				editorText = value;
			},
		};
		const editorContainer = { clear: () => {}, addChild: (_component: unknown) => {} };
		const tui = {
			terminal: { rows: 32 },
			requestRender: () => {},
			setFocus: (component: unknown) => {
				activeComponent = component === editor ? undefined : (component as MenuComponent);
			},
			showOverlay: () => assert.fail("The snippets menu must remain inline"),
			hideOverlay: () => assert.fail("The snippets menu must remain inline"),
		};
		const interactiveShell = {
			editor,
			keybindings: {},
			ui: tui,
			editorContainer,
			extensionDialogs: [] as Array<{ component: MenuComponent; blocked?: BlockedState }>,
			programStatus: {
				setBlocked: (_source: string, blocked?: BlockedState) => {
					activeBlocked = blocked;
				},
			},
			disposeActiveSelector: () => {},
			pushExtensionDialog: (component: MenuComponent, blocked?: BlockedState) => {
				const push = InteractiveMode.prototype.pushExtensionDialog;
				if (push) return push.call(interactiveShell, component, blocked);
				activeComponent = component;
				activeBlocked = blocked;
			},
			showTopExtensionDialog: () => {
				const show = InteractiveMode.prototype.showTopExtensionDialog;
				if (show) return show.call(interactiveShell);
			},
			removeExtensionDialog: (component: MenuComponent) => {
				const remove = InteractiveMode.prototype.removeExtensionDialog;
				if (remove) return remove.call(interactiveShell, component);
				if (activeComponent === component) {
					activeComponent = undefined;
					activeBlocked = undefined;
				}
			},
		};
		const contextTheme = {
			fg: (_color: string, text: string) => text,
			bg: (_color: string, text: string) => text,
			bold: (text: string) => text,
		};
		const ui = {
			theme: contextTheme,
			notify: (message: string) => notifications.push(message),
			setWidget: (_key: string, content: string[] | undefined) => widgetHistory.push(content),
			custom: (factory: CustomFactory, options?: CustomOptions): Promise<boolean> => {
				customOptions.push(options);
				return InteractiveMode.prototype.showExtensionCustom.call(interactiveShell, factory, options);
			},
		};
		runner.setUIContext(ui as unknown as ExtensionUIContext, "tui");
		await runner.emit({ type: "session_start", reason: "startup" });
		assert.deepEqual(extensionErrors, []);

		let currentOpen: Promise<void> | undefined;
		const openMenu = async (): Promise<{ completion: Promise<void> }> => {
			const command = runner.getCommand("snippets");
			assert.ok(command, "The real /snippets command must be registered");
			const optionCount = customOptions.length;
			const completion = command.handler("", runner.createCommandContext()) as Promise<void>;
			currentOpen = completion;
			await Promise.race([
				waitFor(
					() => activeComponent !== undefined && customOptions.length === optionCount + 1,
					"the real inline menu",
				),
				completion.then(() => assert.fail("The snippet menu closed before its component was shown")),
			]);
			return { completion };
		};
		const press = (data: string) => {
			assert.ok(activeComponent, "The inline component must have keyboard focus");
			activeComponent.handleInput(data);
		};
		const search = (query: string) => {
			press("/");
			for (const character of query) press(character);
			press("\r");
			assert.ok(activeComponent, "Confirming fuzzy search must not close the menu");
		};
		const render = () => {
			assert.ok(activeComponent, "The inline component must be rendered");
			return activeComponent.render(100).join("\n").replace(ANSI_PATTERN, "");
		};
		const dispose = async () => {
			try {
				if (currentOpen) {
					for (let attempt = 0; attempt < 3 && activeComponent; attempt++) press("\u001b");
					await currentOpen;
				}
			} finally {
				restore();
			}
		};

		return {
			hostVersion,
			supportsBlocked,
			customOptions,
			widgetHistory,
			notifications,
			extensionErrors,
			openMenu,
			press,
			search,
			render,
			emitInput: (text: string) => runner.emitInput(text, undefined, "interactive"),
			get activeBlocked() {
				return activeBlocked;
			},
			get activeComponent() {
				return activeComponent;
			},
			dispose,
		};
	} catch (error) {
		restore();
		throw error;
	}
}

function assertBlockedWhileOpen(harness: Awaited<ReturnType<typeof createMenuHarness>>): void {
	assert.deepEqual(harness.customOptions.at(-1), EXPECTED_OPTIONS);
	assert.equal(harness.customOptions.at(-1)?.overlay, undefined);
	if (harness.supportsBlocked) assert.deepEqual(harness.activeBlocked, EXPECTED_OPTIONS.blocked);
	else assert.equal(harness.activeBlocked, undefined, `Pi ${harness.hostVersion} must ignore blocked`);
}

function assertClosed(harness: Awaited<ReturnType<typeof createMenuHarness>>): void {
	assert.equal(harness.activeComponent, undefined);
	assert.equal(harness.activeBlocked, undefined, "Closing the inline menu must clear blocked state");
	assert.deepEqual(harness.extensionErrors, []);
}

// @lat: [[lat#Prompt Snippets#Tests#Inline Menu Blocked State]]
describe("Prompt Snippets inline extension UI", () => {
	it("reports a question and preserves fuzzy tabs and Enter apply through the real host UI", async () => {
		const harness = await createMenuHarness();
		try {
			const { completion } = await harness.openMenu();
			assertBlockedWhileOpen(harness);
			assert.match(harness.render(), /Prompt snippets/);

			harness.search("round2a");
			assert.match(harness.render(), /Round2 Alpha/);
			assert.doesNotMatch(harness.render(), /Unrelated Project/);
			harness.press(" ");
			assert.match(harness.render(), /\[x\]/);

			harness.press("\t");
			assert.match(harness.render(), /Round2 Beta/);
			harness.search("round2b");
			harness.press(" ");
			assert.match(harness.render(), /\[x\]/);

			harness.press("\t");
			assert.match(harness.render(), /Round2 Alpha/);
			assert.match(harness.render(), /\[x\]/);
			assert.doesNotMatch(harness.render(), /Unrelated Project/);
			harness.press("\r");
			await completion;
			assertClosed(harness);
			assert.deepEqual(harness.widgetHistory.at(-1), [
				"↑ prepend: Round2 Alpha",
				"↓ append: Round2 Beta",
			]);

			const transformed = await harness.emitInput("Ship it");
			assert.deepEqual(transformed, {
				action: "transform",
				text: "[ROUND2 PREPEND]\n\nShip it\n\n[ROUND2 APPEND]",
				images: undefined,
			});
			assert.equal(harness.widgetHistory.at(-1), undefined);

			const { completion: reopened } = await harness.openMenu();
			assert.equal(harness.customOptions.length, 2, "menuOpen must be reset in finally after Enter");
			assertBlockedWhileOpen(harness);
			harness.press("\u001b");
			await reopened;
			assertClosed(harness);
		} finally {
			await harness.dispose();
		}
	});

	it("does not apply the working copy on Escape and can reopen with clean state", async () => {
		const harness = await createMenuHarness();
		try {
			const { completion } = await harness.openMenu();
			assertBlockedWhileOpen(harness);
			harness.press("\t");
			harness.search("round2b");
			harness.press(" ");
			assert.match(harness.render(), /\[x\]/);
			harness.press("\u001b");
			await completion;
			assertClosed(harness);
			assert.equal(harness.widgetHistory.at(-1), undefined);
			assert.deepEqual(await harness.emitInput("Leave unchanged"), { action: "continue" });

			const { completion: reopened } = await harness.openMenu();
			assert.equal(harness.customOptions.length, 2, "menuOpen must be reset in finally after Escape");
			assertBlockedWhileOpen(harness);
			harness.press("\u001b");
			await reopened;
			assertClosed(harness);
		} finally {
			await harness.dispose();
		}
	});
});
