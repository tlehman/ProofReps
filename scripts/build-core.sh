#!/bin/sh
# Builds the Rust core to WebAssembly (app/public/core.wasm), after clippy's
# panic lints, and fails if any panic path survived (scripts/check-no-panic.ts).
# blaze builds for the host only, so the wasm build is cargo's; blaze is the
# test loop: cd core && blaze test.
set -eu
cd "$(dirname "$0")/.."
# Homebrew's cargo and rustc shadow rustup's and have no wasm target: put the
# rustup toolchain first.
# core/rust-toolchain.toml pins the toolchain.
[ -d "$HOME/.cargo/bin" ] && PATH="$HOME/.cargo/bin:$PATH"
if command -v rustup >/dev/null 2>&1 && RUSTC=$(cd core && rustup which rustc 2>/dev/null); then
  PATH="$(dirname "$RUSTC"):$PATH"
fi
CARGO=cargo
T=wasm32-unknown-unknown
(cd core && $CARGO clippy --release --target $T -q -- -D warnings && $CARGO build --release --target $T -q)
cp core/target/$T/release/proofreps_core.wasm app/public/core.wasm
bun scripts/check-no-panic.ts app/public/core.wasm
ls -l app/public/core.wasm | awk '{print "core.wasm: " $5 " bytes"}'
