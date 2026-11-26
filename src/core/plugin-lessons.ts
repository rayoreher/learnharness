/** Optional lesson choices contributed through the existing plugin activation. */
export type PluginLessonFormat = {
	id: string;
	label: string;
	/** Instructions for the ordinary teacher; never code to evaluate. */
	instructions: string;
} & (
	| { kind: "quiz"; questionTypeId: string }
	| { kind: "workflow"; explanation: "before-questions" | "after-first-answer" }
	| { kind: "output" | "diagram"; language: string }
);
export interface PluginLessonFormatInfo {
	pluginId: string;
	/** Namespaced by the host, never supplied by another plugin. */
	key: string;
	format: PluginLessonFormat;
	questionToolName?: string;
}

export function preparePluginLessonFormat(input: PluginLessonFormat): PluginLessonFormat {
	if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Lesson format must be an object");
	const value = input as unknown as Record<string, unknown>;
	for (const [key, max] of [["id", 64], ["label", 120], ["instructions", 6000]] as const) {
		if (typeof value[key] !== "string" || !value[key].trim() || value[key].length > max) throw new Error(`Invalid lesson format ${key}`);
	}
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.id)) throw new Error("Lesson format id must use lowercase letters, numbers and hyphens");
	const common = { id: input.id, label: input.label.trim(), instructions: input.instructions.trim() };
	if (input.kind === "quiz") {
		if (typeof input.questionTypeId !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.questionTypeId)) throw new Error("Lesson quiz must reference its own native question type");
		return Object.freeze({ ...common, kind: input.kind, questionTypeId: input.questionTypeId });
	}
	if (input.kind === "workflow") {
		if (!["before-questions", "after-first-answer"].includes(input.explanation)) throw new Error("Invalid lesson explanation timing");
		return Object.freeze({ ...common, kind: input.kind, explanation: input.explanation });
	}
	if (input.kind === "output" || input.kind === "diagram") {
		if (typeof input.language !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(input.language)) throw new Error("Lesson presentation must name a registered code-fence language");
		return Object.freeze({ ...common, kind: input.kind, language: input.language });
	}
	throw new Error("Unknown lesson format kind");
}
