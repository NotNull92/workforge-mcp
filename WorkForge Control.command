#!/bin/zsh -f

set -u

tool_root="${0:A:h}"
state_root="${WORKFORGE_MACOS_STATE_ROOT:-${HOME}/Library/Application Support/WorkForge}"
state_path="${state_root}/current.json"

if [[ ! -f "${state_path}" ]]; then
  print -u2 "WorkForge macOS setup is missing."
  print -u2 "Run npm run setup:macos from this release first."
  exit 1
fi

node_path="$(/usr/bin/plutil -extract nodePath raw -o - "${state_path}" 2>/dev/null)"
if [[ -z "${node_path}" || ! -x "${node_path}" ]]; then
  print -u2 "The Node.js runtime recorded by WorkForge is unavailable."
  print -u2 "Run npm run setup:macos again with Node.js 20.19 or newer."
  exit 1
fi

"${node_path}" "${tool_root}/scripts/macos/launch-control.mjs" "$@"
exit_code=$?
if (( exit_code != 0 )) && [[ -t 0 ]]; then
  print
  read -r "?Press Enter to close."
fi
exit "${exit_code}"
