import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { test, type TestContext } from "node:test";
import { createPluginHost } from "../src/server/plugin-host.ts";
import type { PluginBackendContext } from "../src/core/plugins.ts";

async function fixture(t: TestContext) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "native-question-tools-"));
	const directory = path.join(root, "plugins");
	const host = createPluginHost({ directory, appVersion: "0.6.1", createServices: () => ({
		learning: { getSession: () => null }, inference: {} as never,
		agents: { dispose: async () => {} } as never, workers: { dispose: async () => {} } as never,
		createBackgroundTool() { throw new Error("Unexpected background tool"); },
	}) });
	t.after(async () => { await host.dispose(); fs.rmSync(root, { recursive: true, force: true }); });
	await host.initialize();
	async function plugin(id: string) {
		const dist = path.join(directory, id, "dist"); fs.mkdirSync(dist, { recursive: true });
		fs.writeFileSync(path.join(dist, "manifest.json"), JSON.stringify({ apiVersion: 1, id, name: id, version: "1.0.0", minAppVersion: "0.6.1", backend: "backend.cjs", main: "main.js" }));
		fs.writeFileSync(path.join(dist, "backend.cjs"), "exports.activate = ctx => { ctx.handle('context', () => ctx); };\n");
		fs.writeFileSync(path.join(dist, "main.js"), "export function activate() {}\n");
		await host.refresh();
		await host.setEnabled(id, true);
		return await host.call(id, "context") as PluginBackendContext;
	}
	return { host, plugin };
}
const turn = (agent: "teacher" | "prober" | "practice" = "teacher") => ({ chatId: "native-chat", agent });

test("native question requests are copied, teacher-only, deduplicated and activation-owned", async t => {
	const f = await fixture(t), first = await f.plugin("first"), second = await f.plugin("second");
	const requested: Array<"quiz" | "explain"> = ["quiz", "explain"];
	const off = first.registerTools({ agents: ["teacher", "prober", "practice"], nativeQuestionTools: requested, create: () => [] });
	requested.pop();
	const offSecond = second.registerTools({ agents: ["teacher"], nativeQuestionTools: ["explain"], create: () => [] });
	assert.deepEqual(f.host.agentContributions(turn(), ["quiz", "explain"]).nativeQuestionTools, ["quiz", "explain"]);
	for (const role of ["prober", "practice"] as const) assert.equal(f.host.agentContributions(turn(role), []).nativeQuestionTools, undefined);
	const captured = f.host.agentContributions(turn(), []);
	off(); off(); assert.deepEqual(f.host.agentContributions(turn(), []).nativeQuestionTools, ["explain"]);
	offSecond(); assert.equal(f.host.agentContributions(turn(), []).nativeQuestionTools, undefined);
	assert.deepEqual(captured.nativeQuestionTools, ["quiz", "explain"]);
	first.registerTools({ agents: ["teacher"], nativeQuestionTools: ["quiz", "explain"], create: () => [] });
	await f.host.setEnabled("first", false);
	assert.equal(f.host.agentContributions(turn(), []).nativeQuestionTools, undefined);
	assert.throws(() => first.registerTools({ agents: ["teacher"], nativeQuestionTools: ["quiz"], create: () => [] }), /no longer active/);
	await f.host.setEnabled("first", true);
	assert.equal(f.host.agentContributions(turn(), []).nativeQuestionTools, undefined);
});

test("invalid native requests and a failing/colliding factory cannot arm host questions", async t => {
	const f = await fixture(t), ctx = await f.plugin("example");
	for (const requested of [null, "quiz", ["other"], [undefined], Array(1), ["quiz", "quiz"], ["quiz", "explain", "quiz"]]) {
		assert.throws(() => ctx.registerTools({ agents: ["teacher"], nativeQuestionTools: requested as never, create: () => [] }), /unique quiz\/explain/);
	}
	assert.throws(() => ctx.registerTools({ agents: ["prober"], nativeQuestionTools: ["quiz"], create: () => [] }), /teacher target/);
	const failed = ctx.registerTools({ agents: ["teacher"], nativeQuestionTools: ["quiz", "explain"], create() { throw new Error("Factory unavailable"); } });
	assert.deepEqual(f.host.agentContributions(turn(), []), { instructions: [], tools: [] }); failed();
	const colliding = ctx.registerTools({ agents: ["teacher"], nativeQuestionTools: ["explain"], create: () => [{
		name: "quiz", label: "Cannot replace native quiz", description: "Reserved collision fixture", parameters: { type: "object", properties: {} }, execute: async () => ({ content: [], details: null }),
	}] });
	assert.deepEqual(f.host.agentContributions(turn(), ["quiz", "explain"]), { instructions: [], tools: [] }); colliding();
	ctx.registerTools({ agents: ["teacher"], nativeQuestionTools: [], create: () => [] });
	assert.deepEqual(f.host.agentContributions(turn(), []), { instructions: [], tools: [] });
});

test("factory registration changes affect the next native question snapshot", async t => {
	const f = await fixture(t), ctx = await f.plugin("example"); let registered = false;
	ctx.registerTools({ agents: ["teacher"], create() {
		if (!registered) { registered = true; ctx.registerTools({ agents: ["teacher"], nativeQuestionTools: ["explain"], create: () => [] }); }
		return [];
	} });
	assert.equal(f.host.agentContributions(turn(), []).nativeQuestionTools, undefined);
	assert.deepEqual(f.host.agentContributions(turn(), []).nativeQuestionTools, ["explain"]);
});
