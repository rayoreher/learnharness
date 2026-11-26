import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const require = createRequire(import.meta.url);

for (const caller of ["@electron/universal", "@typescript-eslint/typescript-estree", "app-builder-lib"]) {
	test(`patched minimatch preserves matching used by ${caller}`, () => {
		const scoped = createRequire(require.resolve(caller));
		const { Minimatch, minimatch } = scoped("minimatch");
		assert.equal(minimatch("Contents/Resources/x64.node", "*.node", { matchBase: true }), true);
		assert.equal(minimatch("Contents/Resources/x64.node", "*.dylib", { matchBase: true }), false);
		assert.equal(minimatch(".config.js", "*.js", { dot: true }), true);
		assert.equal(minimatch(".config.js", "*.js"), false);
		const literal = new Minimatch("src", { dot: true });
		assert.equal(require("app-builder-lib/out/util/filter.js").hasMagic(literal), false);
		const glob = new Minimatch("src/**/*.ts", { dot: true });
		assert.equal(glob.match("src/lib/example.ts"), true);
		assert.equal(glob.match("src", true), true);
		const exclusion = new Minimatch("!**/*.test.ts", { dot: true });
		assert.equal(exclusion.negate, true);
		assert.equal(exclusion.match("src/a.test.ts"), false);
		assert.equal(exclusion.match("src/a.ts"), true);
		const braces = new Minimatch("src/*.{ts,tsx}", { dot: true });
		assert.equal(require("app-builder-lib/out/util/filter.js").hasMagic(braces), true);
		assert.equal(braces.match("src/a.tsx"), true);
		assert.equal(braces.match("src/a.ts"), true);
		assert.equal(braces.match("src/a.js"), false);
	});
}

test("patched matching preserves the original package file inclusion/exclusion flow", () => {
	const { FileMatcher } = require("app-builder-lib/out/fileMatcher.js");
	const { createFilter } = require("app-builder-lib/out/util/filter.js");
	const matcher = new FileMatcher("/synthetic/source", "/synthetic/out", (s: string) => s, ["src", "!**/*.test.ts"]);
	const patterns: unknown[] = [];
	matcher.computeParsedPatterns(patterns);
	const filter = createFilter("/synthetic/source", patterns);
	const file = { isDirectory: () => false }, directory = { isDirectory: () => true };
	assert.equal(filter("/synthetic/source/src/lib/a.ts", file), true);
	assert.equal(filter("/synthetic/source/src/lib/a.test.ts", file), false);
	assert.equal(filter("/synthetic/source/src", directory), true);
	assert.equal(filter("/synthetic/source/other/a.ts", file), false);
});

test("patched fuzzy links preserve the original ANSI renderer and escape source text", () => {
	const React = require("react"), { renderToStaticMarkup } = require("react-dom/server");
	const Ansi = require("ansi-to-react").default;
	const html = renderToStaticMarkup(React.createElement(Ansi, { linkify: "fuzzy" }, "Visit example.io or https://example.com/docs. Email person@example.com. javascript:alert(1) <script>alert(1)</script>"));
	assert.match(html, /href="http:\/\/example.io"/);
	assert.match(html, /href="https:\/\/example.com\/docs"/);
	assert.doesNotMatch(html, /href="mailto:|href="javascript:|<script>/);
	assert.match(html, /&lt;script&gt;/);
	assert.match(html, /person@example.com/);
});
