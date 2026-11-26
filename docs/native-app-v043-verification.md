# Native application follow-up: 0.4.3

The actual Settings workflow now enables both Core additions and the optional
example, saves defaults, selects a particular lesson and changes its output.
The default and other lessons retain their settings, and accepted answers stay
intact. The dialog identifies its purpose and explains automatic saving.

Model failures show a clear message and existing Retry action. Technical details
start collapsed and remain available. The announced recovery card reflows at
320px, stays visible and gives Retry a minimum 44px touch target. Actual Retry
recovers without replaying accepted practice.

The complete native browser regression passes again: 25 scripted normal model
responses, seven accepted answers, all four initial formats, committed correction,
delayed review, plugin recovery, contributed deck/SVG/numeric and an encoded,
decoded captioned video. The original teacher, SDK, host and storage run normally;
only the normal model endpoint is scripted. No real ChatGPT quality is claimed.

Production compilation/TypeScript, lint, 81 affected native tests, all Core and
portable authoring builds, and the source-free package/browser gate pass. The
full original suite's 5,335 passes/four platform skips belong to the prior
[0.4.2 checkpoint](native-app-v042-verification.md); the follow-up checks cover the affected native tests and actual browser flow. Final locks were queried again: 1,412
registry version pairs, zero advisory hits. No outside dependency changed.

[Hash-bound results](native-app-v043-verification.json) ·
[Desktop recovery](native-app-previews/v043/model-error.png) ·
[Phone recovery](native-app-previews/v043/model-error-phone.png) ·
[Lesson options](native-app-previews/v043/per-lesson-options.png) ·
[Settings activation](native-app-previews/v043/settings-activation.png).
All images contain synthetic records. Real native sign-in, remaining accessibility
observations and the final 80-point UI decision remain open. The existing deployed
prototype and its learner/account data are untouched.
