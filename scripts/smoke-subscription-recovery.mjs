// Actual native app/Settings UI; only subscription replies are synthetic.
import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(import.meta.url);
const { launch } = require("puppeteer-core");
const chrome = process.env.CHROME_PATH;
if (!chrome) throw Error("Set CHROME_PATH to the reviewed browser executable.");
const out = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), "lh-recovery-evidence-")));
fs.mkdirSync(out, { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "lh-recovery-profile-"));
const port = await new Promise((resolve, reject) => {
  const server = net.createServer(); server.once("error", reject);
  server.listen(0, "127.0.0.1", () => { const value = server.address().port; server.close(() => resolve(value)); });
});
const origin = `http://127.0.0.1:${port}`;
const log = fs.openSync(path.join(out, "server.log"), "w");
const app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
  cwd: root, env: { PATH: process.env.PATH, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", LH_DATA_DIR: `${profile}/data`, LH_AUTH_FILE: `${profile}/auth.json`, LH_IGNORE_ENV_KEYS: "1" }, stdio: ["ignore", log, log],
});
let browser;
const errors = [], cases = [];
try {
  let ready = false;
  for (let i = 0; i < 150; i++) {
    if (app.exitCode !== null) throw Error("Native app exited before readiness.");
    try { if ((await fetch(origin + "/chat/new")).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert(ready);
  browser = await launch({ executablePath: chrome, headless: true, userDataDir: `${profile}/browser`, args: [...(process.env.LH_QA_EXTERNAL_ISOLATION === "1" ? ["--no-sandbox"] : []), "--disable-dev-shm-usage"] });
  const page = await browser.newPage();
  page.on("pageerror", error => errors.push(String(error)));
  let status, submissions;
  await page.setRequestInterception(true);
  page.on("request", request => {
    if (request.url() !== origin + "/api/subscriptions") { void request.continue(); return; }
    if (request.method() === "GET") { void request.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ chatgpt: status, native: [] }) }); return; }
    const command = JSON.parse(request.postData());
    assert.equal(command.providerId, "chatgpt"); assert.equal(command.op, "complete-login");
    assert(command.callbackUrl.includes("code=synthetic-return"));
    submissions++;
    if (submissions === 1) { void request.respond({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "Unable to finish this synthetic attempt." }) }); return; }
    status = { ...status, pending: false, activeId: "synthetic-account", accounts: [{ id: "synthetic-account", email: "learner@example.invalid", registration: "oaiapp_synthetic", connected: true, planEnabled: true }] };
    void request.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ value: status }) });
  });
  for (const width of [1440, 320]) {
    status = { available: true, pending: true, allowBackgroundUse: false, activeId: null, accounts: [], error: null }; submissions = 0;
    await page.setViewport({ width, height: 1000 });
    await page.goto(origin + "/chat/new", { waitUntil: "networkidle2" });
    if (width < 928) await page.locator('[aria-label="Open sidebar"]').click();
    await page.locator('[data-testid="settings-entry"]').click();
    await page.locator('[data-testid="chatgpt-login"]').click();
    await page.locator('[data-testid="chatgpt-return-recovery"] summary').click();
    const input = '[data-testid="chatgpt-return-recovery"] input';
    await page.locator(input).fill("http://127.0.0.1:54321/auth/callback?code=synthetic-return&state=synthetic-state");
    assert.equal(await page.$eval(input, el => el.type), "password");
    await page.locator("aria/Finish sign-in").click();
    await page.waitForFunction(() => document.querySelector('[data-testid="chatgpt-return-recovery"] [role="alert"]')?.textContent.includes("could not finish sign-in"));
    assert.equal(await page.$eval(input, el => el.value), "");
    assert(!(await page.$eval("body", el => el.innerText)).includes("synthetic-return"));
    const geometry = await page.evaluate(() => {
      const dialog = document.querySelector('[data-testid="chatgpt-account-dialog"]').getBoundingClientRect();
      const input = document.querySelector('[data-testid="chatgpt-return-recovery"] input').getBoundingClientRect();
      const button = [...document.querySelectorAll('[data-testid="chatgpt-return-recovery"] button')][0].getBoundingClientRect();
      return { viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, dialogLeft: dialog.left, dialogRight: dialog.right, inputHeight: input.height, buttonHeight: button.height };
    });
    assert(geometry.documentWidth <= width && geometry.dialogLeft >= 0 && geometry.dialogRight <= width);
    assert(geometry.inputHeight >= 44 && geometry.buttonHeight >= 44);
    await page.screenshot({ path: path.join(out, `recovery-${width}.png`), fullPage: true });
    await page.locator(input).fill("http://127.0.0.1:54321/auth/callback?code=synthetic-return&state=synthetic-state");
    await page.locator("aria/Finish sign-in").click();
    await page.waitForSelector('[data-testid="chatgpt-account-dialog"]', { hidden: true });
    assert.equal(submissions, 2);
    cases.push({ width, geometry, resumedAfterReload: true, maskedInput: true, clearedBeforeError: true, genericError: true, completedOnlyOnConnectedStatus: true });
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(out, "recovery-evidence.json"), JSON.stringify({ cases, errors, boundary: "Actual native Next/React/Settings/browser; subscription status/control replies are synthetic. Native listener/PKCE/identity/save behavior is covered separately by the isolated web-owner regression. No actual account credentials or provider calls." }, null, 2));
  console.log(JSON.stringify({ cases: cases.length, errors: errors.length }));
} finally {
  await browser?.close(); app.kill("SIGTERM"); fs.closeSync(log);
}
