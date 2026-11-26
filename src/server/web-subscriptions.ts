/** Persistent Node web/dev owner. Never imported by client code. Desktop keeps
 * its existing main-process owner; a broken desktop IPC channel cannot fall
 * back to these files. One server process must own each configured auth dir. */
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { AUTH_FILE } from "../../config.ts";
import { createChatGPT, fileStore } from "../../electron/chatgpt.cjs";
import { createSubscriptions } from "../../electron/subscriptions.cjs";
import { chatGPTControl } from "../../electron/chatgpt-ipc.cjs";
import { subscriptionControl } from "../../electron/subscription-ipc.cjs";
import { emit } from "../core/events.ts";
import type { ChatGPTStatus } from "../core/contracts/chatgpt.ts";
import type { NativeSubscriptionSnapshot } from "../core/contracts/subscriptions.ts";
import { configureWebSubscriptionRuntime, publishWebSubscriptionPacket, webSubscriptionsEnabled, type SubscriptionRuntimeChannel as Channel, type SubscriptionRuntimePacket as Packet } from "../agent/subscription-runtime.ts";
export { webSubscriptionsEnabled } from "../agent/subscription-runtime.ts";
interface BrowserAction { target: string; origin: string; scope: string; expires: number; current(): Promise<boolean> }
const KEY = Symbol.for("lh.webSubscriptions");
interface Registry {
	owner?: ReturnType<typeof createWebSubscriptionOwner>;
}
function registry(): Registry {
	const global = globalThis as typeof globalThis & { [KEY]?: Registry };
	return global[KEY] ??= {};
}
function publish(channel: Channel, packet: Packet) {
	publishWebSubscriptionPacket(channel, packet);
	emit("subscriptions-changed", {});
}
async function loadSDK() {
	const [sdk, copilot, xai] = await Promise.all([
		import("@earendil-works/pi-ai"),
		import("@earendil-works/pi-ai/providers/github-copilot"),
		import("@earendil-works/pi-ai/providers/xai"),
	]);
	return { ...sdk, ...copilot, ...xai };
}

/** Injectable factories/stores keep all test authentication offline. */
export function createWebSubscriptionOwner(options: {
	directory: string;
	chatgptStore?: ReturnType<typeof fileStore>;
	sdk?: unknown;
	onPacket?: (channel: Channel, packet: Packet) => void;
} ) {
	const notify = options.onPacket ?? (() => {});
	const launches = new AsyncLocalStorage<string[]>();
	const actions = new Map<string, BrowserAction>();
	let chatGPTLaunch = 0;
	let chatGPTCallback: { origin: string; redirectUri: string; state: string; generation: number; consumed: boolean } | undefined;
	const openExternal = async (target: string) => {
		const captured = launches.getStore();
		if (!captured || new URL(target).protocol !== "https:") throw new Error("No browser action is pending.");
		captured.push(target);
	};
	const chatgpt = createChatGPT({
		store: options.chatgptStore ?? fileStore(path.join(options.directory, "chatgpt-credentials.json")),
		openExternal,
		onChange: (packet?: Packet) => { if (packet) notify("lh:chatgpt", packet); },
	});
	const native = createSubscriptions({
		directory: options.directory, sdk: options.sdk, loadSDK, openExternal,
		onChange: (snapshot: NativeSubscriptionSnapshot) => notify("lh:subscriptions", { channel: "lh:subscriptions", op: "changed", snapshot }),
	});
	return {
		chatgpt, native,
		async control(providerId: string, command: Record<string, unknown>, origin: string) {
			if (providerId === "chatgpt" && command.op === "complete-login") {
				// Keep the native listener, PKCE, identity validation and durable save as
				// the authority. Never fetch a destination supplied by the browser.
				const attempt = chatGPTCallback;
				const invalid = () => new Error("This return address cannot complete the pending sign-in.");
				if (!attempt || attempt.origin !== origin || attempt.generation !== chatGPTLaunch || attempt.consumed || !(await chatgpt.status()).pending || typeof command.callbackUrl !== "string" || command.callbackUrl.length > 8192 || /[\s\\\x00-\x1f\x7f]/.test(command.callbackUrl)) throw invalid();
				let returned: URL;
				try { returned = new URL(command.callbackUrl); } catch { throw invalid(); }
				const expected = new URL(attempt.redirectUri);
				const params = returned.searchParams;
				if (!command.callbackUrl.startsWith(`${attempt.redirectUri}?`) || returned.origin !== expected.origin || returned.pathname !== expected.pathname || returned.username || returned.password || returned.hash || ["state", "code", "client_id", "error"].some((key) => params.getAll(key).length > 1) || params.get("state") !== attempt.state || (!params.get("code") && !params.get("error")) || (params.has("code") && params.has("error")) || attempt !== chatGPTCallback || attempt.generation !== chatGPTLaunch || attempt.consumed) throw invalid();
				attempt.consumed = true;
				try {
					const response = await fetch(`${attempt.redirectUri}${returned.search}`, { redirect: "error", credentials: "omit", referrerPolicy: "no-referrer", signal: AbortSignal.timeout(5000) });
					await response.body?.cancel();
					if (!response.ok) throw invalid();
				} catch { throw invalid(); }
				return { value: await chatgpt.status() };
			}
			const targets: string[] = [];
			const value = await launches.run(targets, () => providerId === "chatgpt"
				? chatGPTControl(command, chatgpt)
				: subscriptionControl({ ...command, providerId }, native));
			if (providerId === "chatgpt" && ["cancel", "disconnect", "logout"].includes(String(command.op))) chatGPTCallback = undefined;
			let browserAction: string | undefined;
			const target = targets[0];
			if (target) {
				const scope = providerId === "chatgpt" ? "chatgpt" : `${providerId}:${command.attemptId}:${command.actionId}`;
				for (const [id, action] of actions) if (action.expires <= Date.now() || action.scope === scope) actions.delete(id);
				const id = randomUUID();
				const generation = providerId === "chatgpt" ? ++chatGPTLaunch : chatGPTLaunch;
				if (providerId === "chatgpt") {
					const authorization = new URL(target);
					const redirectUri = authorization.searchParams.get("redirect_uri")!;
					const callback = new URL(redirectUri);
					if (callback.protocol !== "http:" || callback.hostname !== "127.0.0.1" || callback.pathname !== "/auth/callback" || callback.search || callback.hash || callback.username || callback.password) throw new Error("Invalid native sign-in return address.");
					chatGPTCallback = { origin, redirectUri, state: authorization.searchParams.get("state")!, generation, consumed: false };
				}
				const current = providerId === "chatgpt"
					? async () => generation === chatGPTLaunch && (await chatgpt.status()).pending === true
					: async () => (await native.status()).some((status: { providerId: string; interaction?: { attemptId: string; browser?: { id: string } } }) => status.providerId === providerId && status.interaction?.attemptId === command.attemptId && status.interaction?.browser?.id === command.actionId);
				actions.set(id, { target, origin, scope, expires: Date.now() + 180000, current });
				browserAction = `/api/subscriptions/browser?id=${id}`;
			}
			return { value, ...(browserAction ? { browserAction } : {}) };
		},
		async takeBrowserAction(id: string, origin: string): Promise<string | undefined> {
			const action = actions.get(id);
			if (!action || action.origin !== origin) return;
			actions.delete(id);
			if (action.expires <= Date.now() || !await action.current()) return;
			return action.target;
		},
		close() { actions.clear(); chatGPTCallback = undefined; chatgpt.close(); native.close(); },
	};
}
export function webSubscriptionOwner() {
	if (!webSubscriptionsEnabled()) throw new Error("Web subscription controls are unavailable in desktop-owned mode.");
	const state = registry();
	if (!state.owner) {
		state.owner = createWebSubscriptionOwner({ directory: path.dirname(AUTH_FILE), onPacket: publish });
		process.once("exit", () => state.owner?.close());
	}
	return state.owner;
}
/** Private runtime calls only: no HTTP lease/token operation exists. */
export async function webSubscriptionRequest<T>(channel: Channel, op: string, fields: Record<string, unknown>): Promise<T> {
	const owner = webSubscriptionOwner();
	let value: unknown;
	if (channel === "lh:chatgpt") {
		if (op === "status") value = { status: await owner.chatgpt.status(), ...owner.chatgpt.stamp() };
		else if (op === "models") value = await owner.chatgpt.models();
		else if (op === "lease" && typeof fields.background === "boolean") value = await owner.chatgpt.lease(fields.background, fields);
		else throw new Error("Invalid private operation.");
	} else {
		if (op === "snapshot") value = await owner.native.snapshot();
		else if (op === "lease" && typeof fields.background === "boolean") value = await owner.native.lease(fields.scope, fields.background);
		else throw new Error("Invalid private operation.");
	}
	return value as T;
}
configureWebSubscriptionRuntime(webSubscriptionRequest);

export async function webSubscriptionStatus(): Promise<{ chatgpt: ChatGPTStatus; native: NativeSubscriptionSnapshot["statuses"] }> {
	const owner = webSubscriptionOwner();
	const [chatgpt, native] = await Promise.all([owner.chatgpt.status(), owner.native.status()]);
	return { chatgpt, native };
}
