# Native sign-in return recovery

When LearnHarness runs on a server and its browser runs on another computer,
ChatGPT returns to the browser computer’s loopback address. The native callback
listener is still on the server, so the browser shows a connection refusal.
The original loopback registration and token exchange are retained, following
[OpenAI’s documented sign-in contract](https://developers.openai.com/siwc/token-sharing-open-source/sign-in).

The pending ChatGPT dialog now offers **Sign-in page can’t connect?** Paste the
full return address there and choose **Finish sign-in**. After a page reload,
**Finish sign-in…** reopens the existing attempt. The masked field clears before
submission. Errors never repeat the address; an HTTP acknowledgement keeps the
form waiting until native identity verification completes.

The server accepts only the exact current loopback callback, state and initiating
app origin. It rejects different hosts/ports/paths, duplicate state/code fields,
credentials, fragments, stale/cancelled attempts and replay. Forwarding uses the
privately captured native destination, without redirects, cookies or referrer.
The original PKCE/JWT/identity checks and durable credential save remain authoritative.
Desktop controls and credential storage are unchanged. No dependency was added.

Lesson practice 0.4.4 also fixes a real-model authoring failure: a question on a
different plan node was incorrectly described as a disabled format. Missing
lesson, unselected format and wrong node are now separate errors. The wrong-node
case still rejects the input and reports the expected lesson node so the teacher
can retry. Its regression fails on the previous backend and passes on the fix;
settings and accepted progress remain unchanged. Live replay is tracked in #11.

Validation: **115 relevant native/auth tests and 22 lesson/viewer tests pass**, production build and final TypeScript
pass, original ESLint reports no errors, all Core/authoring builds and the original
source-free server/full plugin-browser gate pass. Actual native browser checks at
1440 and 320 pixels verify reload recovery, masked/cleared input, usable errors,
44px input/button targets, no horizontal overflow and connected-state completion.
Those browser subscription replies are synthetic; the separate native owner test
exercises the actual listener, PKCE, signed identity and save path using synthetic
credentials. [Desktop](native-app-previews/sign-in-recovery/recovery-1440.png) ·
[Phone](native-app-previews/sign-in-recovery/recovery-320.png).

The reported real sign-in was recovered, and the native app confirms connection
and plan permission. Real model calls have produced a diagnostic, master plan,
small lesson, confident wrong-answer correction and queued review in one separate
Python-loops session. The live check uses ordinary native APIs. It does not yet
claim real course completion, cleared review, a final UI score or release.

[Exact source/result hashes and coverage](native-sign-in-recovery.json) ·
[Reviewed intake and dispositions](native-sign-in-recovery-intake.json).
The raw user callback and account identity are excluded from all public evidence.
