#!/bin/sh
# Mirrors core Lean (cauli's WebAssembly build of the cauli/lean4 fork, Init
# only, no Mathlib) into app/public/lean/, which the web export copies into the
# site and the service worker precaches. Every file is pinned by SHA-256 in
# scripts/lean.lock; a file that doesn't match is an error. To move to a new
# runtime on purpose: delete lean.lock, run this, and commit the new lock.
#
# LEAN_SRC overrides where the files come from (default: this repo's
# `lean-runtime` GitHub release, then the LeanCards deploy).
set -eu
cd "$(dirname "$0")/.."
OUT=app/public/lean
LOCK=scripts/lean.lock
mkdir -p "$OUT/core-lib"

get() { # path
  [ -s "$OUT/$1" ] && return 0
  name=$(echo "$1" | tr / _)
  for src in ${LEAN_SRC:-https://github.com/tlehman/ProofReps/releases/download/lean-runtime https://leancards.mail-fcc.workers.dev/lean}; do
    case "$src" in */releases/download/*) url="$src/$name" ;; *) url="$src/$1" ;; esac
    if curl --proto '=https' -fsSL --retry 3 -o "$OUT/$1.part" "$url" 2>/dev/null; then
      mv "$OUT/$1.part" "$OUT/$1"
      return 0
    fi
  done
  rm -f "$OUT/$1.part"
  echo "fetch-lean: couldn't download $1" >&2
  exit 1
}

FILES=$(awk '{print $2}' "$LOCK" 2>/dev/null || true)
if [ -z "$FILES" ]; then
  get core-layer.json
  FILES="lean.js lean.wasm.gz core-layer.json $(sed -n 's/.*"file": *"\([^"]*\)".*/core-lib\/\1/p' "$OUT/core-layer.json")"
fi
for f in $FILES; do get "$f"; done

sums=$(cd "$OUT" && shasum -a 256 $FILES)
if [ -f "$LOCK" ]; then
  echo "$sums" | diff -u "$LOCK" - || { echo "fetch-lean: files don't match $LOCK" >&2; exit 1; }
else
  echo "$sums" > "$LOCK"
  echo "fetch-lean: wrote $LOCK"
fi
du -sh "$OUT"
