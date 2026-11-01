#!/usr/bin/env bash
# Starts ProofReps and puts it on your tailnet.
#
#   scripts/start.sh            # build what's missing or stale, start, print the tailnet URL
#   scripts/start.sh --rebuild  # rebuild the site even if it looks fresh
#
# 1. Lean: the Lean project in server/lean (Mathlib + the Lean REPL). Mathlib's
#    prebuilt .olean files come from `lake exe cache get` the first time.
# 2. The app: the Rust core (core.wasm) and the static site (app/dist).
# 3. The server (server/src/main.ts) on 127.0.0.1:$PORT. It boots $LEAN_WORKERS
#    long-lived Lean processes and imports Mathlib in each before it says ready.
# 4. `tailscale serve` proxies https://<this machine>.<tailnet>.ts.net:$PORT to it,
#    reachable only from your tailnet. Stopped again when this script exits.
#
# Env: PORT (8790), LEAN_WORKERS (4), LEAN_TIMEOUT_MS (20000).
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$PWD
export PORT=${PORT:-8790}
REBUILD=0
[[ "${1:-}" == "--rebuild" ]] && REBUILD=1

say() { printf '\033[1;35m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }
for c in bun lake curl; do command -v "$c" >/dev/null || die "needs $c on PATH"; done

# ---------- 1. Lean + Mathlib ----------
(
  cd server/lean
  if [[ ! -f .lake/packages/mathlib/.lake/build/lib/lean/Mathlib.olean ]]; then
    say "Fetching Mathlib's prebuilt files (first run only, a few GB)"
    lake exe cache get
  fi
  say "Building the Lean REPL"
  lake build repl 2>&1 | tail -1
)

# ---------- 2. The app ----------
if [[ ! -f app/public/core.wasm || -n "$(find core/src core/Cargo.toml -newer app/public/core.wasm 2>/dev/null | head -1)" ]]; then
  say "Building the Rust core"
  ./scripts/build-core.sh
fi
[[ -d app/node_modules ]] || (say "Installing app dependencies" && cd app && bun install --frozen-lockfile)
if [[ $REBUILD == 1 || ! -f app/dist/index.html || -n "$(find app/src app/public app/App.tsx app/app.json app/index.ts -newer app/dist/index.html 2>/dev/null | head -1)" ]]; then
  say "Building the site"
  (cd app && rm -rf dist && bun x expo export --platform web >/dev/null && bun ../scripts/postexport.ts)
fi

# ---------- 3. The server ----------
if curl -fs "http://127.0.0.1:$PORT/api/status" >/dev/null 2>&1; then
  die "something is already serving on port $PORT (another scripts/start.sh?). Stop it or set PORT."
fi
say "Starting the server and importing Mathlib"
bun server/src/main.ts &
SERVER=$!
TS_ON=0
cleanup() {
  trap - EXIT INT TERM
  kill "$SERVER" 2>/dev/null || true
  wait "$SERVER" 2>/dev/null || true
  if [[ $TS_ON == 1 ]]; then tailscale serve --https="$PORT" off >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT INT TERM

for _ in $(seq 1 300); do
  kill -0 "$SERVER" 2>/dev/null || die "the server exited"
  if curl -fs "http://127.0.0.1:$PORT/api/status" 2>/dev/null | grep -q '"ready":true'; then break; fi
  sleep 1
done
curl -fs "http://127.0.0.1:$PORT/api/status" | grep -q '"ready":true' || die "Lean didn't come up in 5 minutes"

# ---------- 4. The tailnet ----------
URL=""
if command -v tailscale >/dev/null && DNS=$(tailscale status --json 2>/dev/null | bun -e 'const s = await Bun.stdin.json(); if (s.BackendState !== "Running") process.exit(1); console.log(s.Self.DNSName.replace(/\.$/, ""))'); then
  if tailscale serve --bg --https="$PORT" "http://127.0.0.1:$PORT" >/dev/null; then
    TS_ON=1
    URL="https://$DNS:$PORT/"
  else
    echo "tailscale serve failed: if it's a permissions error, run once: sudo tailscale set --operator=\$USER" >&2
  fi
else
  echo "Tailscale isn't running: serving on this machine only." >&2
fi

echo
say "ProofReps is up (Lean 4 + Mathlib, $(curl -fs "http://127.0.0.1:$PORT/api/status" | bun -e 'const s = await Bun.stdin.json(); console.log(`${s.workers.size} workers, sandboxed: ${s.sandboxed}`)'))"
echo "    this machine: http://127.0.0.1:$PORT/"
[[ -n $URL ]] && printf '    tailnet:      \033[1;4m%s\033[0m\n' "$URL"
echo "    (Ctrl-C stops it)"
echo
wait "$SERVER"
