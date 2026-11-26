import assert from "node:assert/strict";
import test, { after } from "node:test";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { createModels, type OAuthCredential, type ProviderAuthInteraction } from "@earendil-works/pi-ai";
import { githubCopilotProvider } from "@earendil-works/pi-ai/providers/github-copilot";
import { xaiProvider } from "@earendil-works/pi-ai/providers/xai";

const directory = await fs.mkdtemp(path.join(os.tmpdir(), "lh-web-sub-"));
process.env.LH_AUTH_FILE = path.join(directory, "auth.json");
process.env.LH_DATA_DIR = path.join(directory, "data");
delete process.env.LH_DESKTOP_SERVER; delete process.env.LH_DESKTOP_API_SECRET;
await fs.writeFile(process.env.LH_AUTH_FILE, "{}", { mode: 0o600 });
const require = createRequire(import.meta.url);
const { SCOPES } = require("../electron/chatgpt.cjs");
const { createWebSubscriptionOwner, webSubscriptionOwner, webSubscriptionsEnabled } = await import("../src/server/web-subscriptions.ts");
const { subscriptionControlsResponse, subscriptionBrowserResponse } = await import("../src/server/web-subscription-http.ts");
const chat = await import("../src/agent/chatgpt-bridge.ts");
const native = await import("../src/agent/subscription-bridge.ts");
const { piModels } = await import("../src/agent/models.ts");
const { refreshConnectionCatalog } = await import("../src/server/model-catalog.ts");
const model = piModels().getModels("openai").find((entry) => entry.api === "openai-responses")!;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input) => {
	assert.equal(String(input), "https://api.openai.com/v1/models", "unexpected network request forbidden");
	return Response.json({ models: [{ slug: model.id, display_name: "Fixture ChatGPT", visibility: "list" }] });
};
const copilot = githubCopilotProvider().getModels()[0]!;
const credentials = (id: string): OAuthCredential => ({ type: "oauth", access: id === "xai" ? "fixture-xai-access" : "tid=fixture;proxy-ep=proxy.individual.githubcopilot.com;", refresh: "fixture-refresh", expires: Date.now() + 3600000, ...(id === "github-copilot" ? { availableModelIds: [copilot.id] } : {}) });
await fs.writeFile(path.join(directory, "chatgpt-credentials.json"), JSON.stringify({ version: 1, hostId: "fixture-host", allowBackgroundUse: true, activeId: "fixture-account", registrations: [{ id: "fixture-account", clientId: "oaiapp_fixture", issuer: "https://auth.openai.com", subject: "fixture-subject", email: "fixture@example.invalid", tokens: { accessToken: "fixture-chatgpt-access", refreshToken: "fixture-chatgpt-refresh", idToken: "fixture-id-token", scopes: SCOPES, expiresAt: Date.now() + 3600000 } }] }), { mode: 0o600 });
for (const id of ["github-copilot", "xai"]) await fs.writeFile(path.join(directory, `${id}-credentials.json`), JSON.stringify({ version: 1, allowBackgroundUse: true, connectionId: "00000000-0000-4000-8000-000000000001", credential: credentials(id) }), { mode: 0o600 });
function request(command?: Record<string, unknown>, origin = "http://192.168.1.10:3000") {
	return new Request(`${origin}/api/subscriptions`, { method: command ? "POST" : "GET", headers: { host: new URL(origin).host, origin, "sec-fetch-site": "same-origin", "x-learnharness-subscriptions": "1", "content-type": "application/json" }, ...(command ? { body: JSON.stringify(command) } : {}) });
}
after(async () => { webSubscriptionOwner().close(); globalThis.fetch = originalFetch; await fs.rm(directory, { recursive: true, force: true }); });

test("ordinary web restores configured sibling credentials, private runtime leases work for LAN-owned requests", async () => {
	await refreshConnectionCatalog();
	assert(chat.chatGPTConnected()); assert(native.nativeSubscriptionConnected("github-copilot")); assert(native.nativeSubscriptionConnected("xai"));
	assert.equal((await chat.chatGPTLease(chat.chatGPTScope(model.id), false)).accessToken, "fixture-chatgpt-access");
	const xaiModel = native.nativeSubscriptionModels().find((entry) => entry.provider === "xai-subscription")!;
	assert.equal((await native.subscriptionLease(native.subscriptionScope("xai", xaiModel.id), false)).apiKey, "fixture-xai-access");
	const response = await subscriptionControlsResponse(request());
	assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
	const publicState = await response.text();
	for (const secret of ["fixture-chatgpt-access", "fixture-chatgpt-refresh", "fixture-id-token", "fixture-xai-access", "fixture-refresh"]) assert(!publicState.includes(secret));
	assert(publicState.includes("fixture@example.invalid"));
});

test("web background OFF immediately aborts background streams, retains foreground and rejects private background leases", async () => {
	const foreground = chat.chatGPTAbortController(false), background = chat.chatGPTAbortController(true);
	const nativeForeground = native.subscriptionAbortController("xai", false), nativeBackground = native.subscriptionAbortController("xai", true);
	try {
		assert.equal((await subscriptionControlsResponse(request({ providerId: "chatgpt", op: "consent", enabled: false }))).status, 200);
		assert(background.controller.signal.aborted); assert(!foreground.controller.signal.aborted);
		const scope = chat.chatGPTScope(model.id); await chat.chatGPTLease(scope, false); await assert.rejects(chat.chatGPTLease(scope, true));
		assert.equal((await subscriptionControlsResponse(request({ providerId: "xai", op: "consent", enabled: false }))).status, 200);
		assert(nativeBackground.controller.signal.aborted); assert(!nativeForeground.controller.signal.aborted);
		const xaiModel = native.nativeSubscriptionModels().find((entry) => entry.provider === "xai-subscription")!;
		const nativeScope = native.subscriptionScope("xai", xaiModel.id); await native.subscriptionLease(nativeScope, false); await assert.rejects(native.subscriptionLease(nativeScope, true));
		await subscriptionControlsResponse(request({ providerId: "xai", op: "disconnect" }));
		assert(nativeForeground.controller.signal.aborted); assert(!native.nativeSubscriptionConnected("xai"));
		assert.deepEqual(JSON.parse(await fs.readFile(path.join(directory, "xai-credentials.json"), "utf8")), { version: 1, allowBackgroundUse: false });
	} finally { foreground.release(); background.release(); nativeForeground.release(); nativeBackground.release(); }
});

test("HTTP controls reject cross-origin, simple-form and private credential operations; desktop never falls back", async () => {
	const forged = request({ providerId: "chatgpt", op: "consent", enabled: true }); forged.headers.set("origin", "https://unrelated.invalid");
	assert.equal((await subscriptionControlsResponse(forged)).status, 403);
	const noHeader = request(); noHeader.headers.delete("x-learnharness-subscriptions");
	assert.equal((await subscriptionControlsResponse(noHeader)).status, 403);
	const noOrigin = request({ providerId: "chatgpt", op: "cancel" }); noOrigin.headers.delete("origin");
	assert.equal((await subscriptionControlsResponse(noOrigin)).status, 403);
	const recovery = request({ providerId: "chatgpt", op: "complete-login", callbackUrl: "http://127.0.0.1:1/auth/callback?code=private-fixture" });
	const invalidRecovery = await subscriptionControlsResponse(recovery);
	assert.equal(invalidRecovery.status, 400); assert(!(await invalidRecovery.text()).includes("private-fixture"));
	const crossSiteRecovery = request({ providerId: "chatgpt", op: "complete-login", callbackUrl: "http://127.0.0.1:1/auth/callback" });
	crossSiteRecovery.headers.set("sec-fetch-site", "cross-site");
	assert.equal((await subscriptionControlsResponse(crossSiteRecovery)).status, 403);
	for (const op of ["lease", "models", "snapshot", "token", "openExternal"]) assert.equal((await subscriptionControlsResponse(request({ providerId: "chatgpt", op }))).status, 400);
	const huge = request({ providerId: "chatgpt", op: "cancel", padding: "x".repeat(16384) });
	assert.equal((await subscriptionControlsResponse(huge)).status, 413);
	const browser = new Request("http://localhost:3000/api/subscriptions/browser?id=00000000-0000-4000-8000-000000000001");
	assert.equal((await subscriptionBrowserResponse(browser)).status, 403);
	for (const [marker, secret] of [["1", undefined], [undefined, "fixture-capability"]]) {
		if (marker) process.env.LH_DESKTOP_SERVER = marker; else delete process.env.LH_DESKTOP_SERVER;
		if (secret) process.env.LH_DESKTOP_API_SECRET = secret; else delete process.env.LH_DESKTOP_API_SECRET;
		assert(!webSubscriptionsEnabled());
		assert.equal((await subscriptionControlsResponse(request())).status, 404);
		await assert.rejects(chat.chatGPTRequest("status"), /desktop app/);
	}
	delete process.env.LH_DESKTOP_SERVER; delete process.env.LH_DESKTOP_API_SECRET;
});

function fakeSDK(login: (id: string, interaction: ProviderAuthInteraction) => Promise<OAuthCredential>) {
	const factory = (id: string) => {
		const provider = id === "xai" ? xaiProvider() : githubCopilotProvider();
		return { ...provider, auth: { oauth: { ...provider.auth.oauth!, login: (interaction: ProviderAuthInteraction) => login(id, interaction), refresh: async () => credentials(id) } } };
	};
	return { createModels, githubCopilotProvider: () => factory("github-copilot"), xaiProvider: () => factory("xai") };
}
test("device browser actions preserve complete URLs privately, are origin-bound, one-use and cancellation-bound", async () => {
	const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "lh-web-action-"));
	let complete!: (credential: OAuthCredential) => void;
	const pending = new Promise<OAuthCredential>((resolve) => { complete = resolve; });
	let notified!: () => void;
	const notification = new Promise<void>((resolve) => { notified = resolve; });
	const owner = createWebSubscriptionOwner({ directory: scratch, sdk: fakeSDK(async (_id, interaction) => { interaction.notify({ type: "device_code", userCode: "PUBLIC", verificationUri: "https://auth.x.ai/device?user_code=PUBLIC" }); notified(); return pending; }) });
	try {
		const login = owner.control("xai", { op: "login" }, "http://localhost:3000"); await notification;
		const interaction = (await owner.native.status()).find((entry: { providerId: string }) => entry.providerId === "xai")!.interaction;
		const command = { op: "open", attemptId: interaction.attemptId, actionId: interaction.browser.id };
		const opened = await owner.control("xai", command, "http://localhost:3000");
		assert(opened.browserAction); assert(!JSON.stringify(opened).includes("auth.x.ai"));
		const id = new URL(opened.browserAction, "http://localhost:3000").searchParams.get("id")!;
		assert.equal(await owner.takeBrowserAction(id, "http://other.invalid"), undefined);
		assert.equal(await owner.takeBrowserAction(id, "http://localhost:3000"), "https://auth.x.ai/device?user_code=PUBLIC");
		assert.equal(await owner.takeBrowserAction(id, "http://localhost:3000"), undefined);
		const stale = await owner.control("xai", command, "http://localhost:3000");
		await owner.control("xai", { op: "cancel" }, "http://localhost:3000");
		complete(credentials("xai")); await login;
		assert.equal(await owner.takeBrowserAction(new URL(stale.browserAction!, "http://localhost:3000").searchParams.get("id")!, "http://localhost:3000"), undefined);
	} finally { owner.close(); await fs.rm(scratch, { recursive: true, force: true }); }
});

test("web ChatGPT login supplies only an opaque browser action; cancel/replacement invalidates earlier launch", async () => {
	const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "lh-web-chat-action-"));
	const owner = createWebSubscriptionOwner({ directory: scratch, sdk: fakeSDK(async (id) => credentials(id)) });
	try {
		const first = await owner.control("chatgpt", { op: "login" }, "http://localhost:3000");
		assert(first.browserAction); assert(!JSON.stringify(first).includes("auth.openai.com"));
		await owner.control("chatgpt", { op: "cancel" }, "http://localhost:3000");
		const second = await owner.control("chatgpt", { op: "login" }, "http://localhost:3000");
		assert(second.browserAction);
		const firstId = new URL(first.browserAction, "http://localhost:3000").searchParams.get("id")!;
		assert.equal(await owner.takeBrowserAction(firstId, "http://localhost:3000"), undefined);
		const secondId = new URL(second.browserAction, "http://localhost:3000").searchParams.get("id")!;
		const target = new URL((await owner.takeBrowserAction(secondId, "http://localhost:3000"))!);
		assert.equal(target.origin, "https://auth.openai.com");
		const callback = new URL(target.searchParams.get("redirect_uri")!);
		assert.equal(callback.hostname, "127.0.0.1"); assert.equal(callback.pathname, "/auth/callback");
		assert(target.searchParams.has("state")); assert(target.searchParams.has("code_challenge"));
	} finally { owner.close(); await fs.rm(scratch, { recursive: true, force: true }); }
});

test("remote return recovery is origin/state/port/attempt bound and uses the native PKCE/identity/save path once", async () => {
	const { privateKey, publicKey } = await generateKeyPair("RS256");
	const jwk = { ...await exportJWK(publicKey), kid: "recovery-fixture", alg: "RS256", use: "sig" };
	const previousFetch = globalThis.fetch;
	let saved = { version: 1, hostId: "urn:uuid:recovery-fixture", activeId: null, registrations: [] } as any;
	let authorization: URL, exchanged: URLSearchParams | undefined;
	let localRequests = 0, sawPending = false, terminal!: () => void;
	const done = new Promise<void>((resolve) => { terminal = resolve; });
	globalThis.fetch = async (input, init) => {
		const target = new URL(String(input));
		if (target.origin.startsWith("http://127.0.0.1:")) {
			localRequests++;
			assert.equal(init?.redirect, "error"); assert.equal(init?.credentials, "omit");
			assert.equal(target.origin + target.pathname, authorization.searchParams.get("redirect_uri"));
			return originalFetch(input, init);
		}
		if (target.href === "https://auth.openai.com/api/accounts/oauth/token") {
			exchanged = init!.body as URLSearchParams;
			const idToken = await new SignJWT({ nonce: authorization.searchParams.get("nonce"), email: "recovery@example.invalid" }).setProtectedHeader({ alg: "RS256", kid: jwk.kid }).setIssuer("https://auth.openai.com").setSubject("recovery-fixture").setAudience(exchanged.get("client_id")!).setIssuedAt().setExpirationTime("1h").sign(privateKey);
			return Response.json({ access_token: "fixture-recovery-access", refresh_token: "fixture-recovery-refresh", id_token: idToken, token_type: "Bearer", expires_in: 3600, scope: SCOPES.join(" ") });
		}
		if (target.href === "https://auth.openai.com/.well-known/jwks.json") return Response.json({ keys: [jwk] });
		return previousFetch(input, init);
	};
	const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "lh-web-recovery-"));
	const origin = "http://localhost:3000";
	const owner = createWebSubscriptionOwner({ directory: scratch, sdk: fakeSDK(async (id) => credentials(id)), chatgptStore: { read: async () => structuredClone(saved), write: async (value: any) => { saved = structuredClone(value); } }, onPacket: (_channel, packet: any) => {
		if (packet.status?.pending) sawPending = true;
		if (sawPending && packet.status?.pending === false) terminal();
	} });
	try {
		await assert.rejects(owner.control("chatgpt", { op: "complete-login", callbackUrl: "http://127.0.0.1:1/auth/callback?code=fixture" }, origin));
		const login = await owner.control("chatgpt", { op: "login" }, origin);
		const actionId = new URL(login.browserAction!, origin).searchParams.get("id")!;
		authorization = new URL((await owner.takeBrowserAction(actionId, origin))!);
		const callback = new URL(authorization.searchParams.get("redirect_uri")!);
		callback.search = new URLSearchParams({ state: authorization.searchParams.get("state")!, code: "fixture-recovery-code", client_id: "oaiapp_recovery_fixture" }).toString();
		const invalid = [callback.href.replace("http:", "https:"), callback.href.replace("127.0.0.1", "localhost"), callback.href.replace(callback.port, "1"), callback.href.replace("/auth/callback", "/api/keys"), callback.href + "#fragment", callback.href + "&state=duplicate", callback.href + "&code=duplicate", callback.href.replace(authorization.searchParams.get("state")!, "wrong-state"), "http://unrelated.invalid/auth/callback?code=fixture", callback.href.replace("127.0.0.1", "user@127.0.0.1"), callback.href.replace("127.0.0.1", "2130706433"), "x".repeat(8193)];
		for (const callbackUrl of invalid) await assert.rejects(owner.control("chatgpt", { op: "complete-login", callbackUrl }, origin));
		await assert.rejects(owner.control("chatgpt", { op: "complete-login", callbackUrl: callback.href }, "http://different.invalid"));
		assert.equal(localRequests, 0); assert.equal(exchanged, undefined); assert.equal((await owner.chatgpt.status()).pending, true);
		const result = await owner.control("chatgpt", { op: "complete-login", callbackUrl: callback.href }, origin);
		assert(!JSON.stringify(result).includes("fixture-recovery-code"));
		await Promise.race([done, new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error("Recovery did not settle")), 3000); timer.unref(); })]);
		const status = await owner.chatgpt.status();
		assert.equal(status.pending, false); assert.equal(status.error, null); assert(status.accounts.some((a: any) => a.connected));
		assert.equal(saved.registrations.length, 1); assert.equal(saved.registrations[0].tokens.accessToken, "fixture-recovery-access");
		assert.equal(exchanged!.get("redirect_uri"), authorization.searchParams.get("redirect_uri"));
		assert.equal(createHash("sha256").update(exchanged!.get("code_verifier")!).digest("base64url"), authorization.searchParams.get("code_challenge"));
		await assert.rejects(owner.control("chatgpt", { op: "complete-login", callbackUrl: callback.href }, origin));
		assert.equal(localRequests, 1);
		await owner.control("chatgpt", { op: "login" }, origin);
		await assert.rejects(owner.control("chatgpt", { op: "complete-login", callbackUrl: callback.href }, origin));
		await owner.control("chatgpt", { op: "cancel" }, origin);
		await assert.rejects(owner.control("chatgpt", { op: "complete-login", callbackUrl: callback.href }, origin));
		assert.equal(localRequests, 1);
	} finally { owner.close(); globalThis.fetch = previousFetch; await fs.rm(scratch, { recursive: true, force: true }); }
});
