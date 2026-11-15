#!/usr/bin/env bash
set -euo pipefail

# Supply existing, reviewed installations. This runner installs nothing.
studio_node=$(readlink -f "${LH_COURSE_NODE:-$(command -v node)}")
studio_chrome=$(readlink -f "${LH_COURSE_CHROME:?Set LH_COURSE_CHROME to an existing Chromium executable}")
studio_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
studio_artifacts=${LH_COURSE_ARTIFACTS:-$(mktemp -d /tmp/course-studio-browser.XXXXXX)}
mkdir -p -- "$studio_artifacts"
studio_artifacts=$(readlink -f "$studio_artifacts")
"$studio_node" --input-type=module -e 'const [major,minor]=process.versions.node.split(".").map(Number);if(major<22||(major===22&&minor<13))throw new Error("Use Node 22.13 or newer");'

studio_args=(--unshare-all --die-with-parent --ro-bind /usr /usr --ro-bind /lib /lib --ro-bind /lib64 /lib64
  --ro-bind /etc/fonts /etc/fonts --ro-bind "$studio_node" /opt/node-runner
  --ro-bind "$(dirname -- "$studio_chrome")" /opt/chrome
  --ro-bind "$studio_root/course-app" /app/course-app --ro-bind "$studio_root/public/course-studio" /app/public/course-studio
  --bind "$studio_artifacts" /artifacts --proc /proc --dev /dev --tmpfs /tmp --clearenv
  --setenv PATH /usr/bin:/bin --setenv HOME /tmp --setenv LANG C.UTF-8
  --setenv LH_COURSE_ISOLATED_BROWSER 1 --setenv LH_COURSE_CHROME "/opt/chrome/$(basename -- "$studio_chrome")")
if [[ -n ${LH_COURSE_LIVE_FIXTURE:-} ]]; then
  studio_args+=(--ro-bind "$(readlink -f "$LH_COURSE_LIVE_FIXTURE")" /fixtures/course.json --setenv LH_COURSE_LIVE_FIXTURE /fixtures/course.json)
fi
bwrap "${studio_args[@]}" --chdir /app /opt/node-runner /app/course-app/tests/browser.mjs
printf 'Browser artifacts: %s\n' "$studio_artifacts"
