# ProofReps ⊢💪

Daily reps for Lean 4 and formal methods: short lessons, a streak, XP, spaced review, and every
answer you type is checked by **real Lean 4 running in your browser tab**. No server, no account.

**https://tobilehman.com/ProofReps**

Anything Lean accepts is correct. The app never compares your answer to a stored one. Lean
shows its real syntax errors, type errors and goal states, at the cursor, as you type.

It grew out of LeanCards (`~/Archive/Projects/learn-lean`): same in-browser Lean runtime, same
spaced-repetition schedule.

## Layout

- `app/`: the app. Expo / React Native, exported as a static web app (react-native-web).
  - `src/content/`: the course, one file per unit (`u01.ts` ...). How to write exercises:
    [`src/content/README.md`](app/src/content/README.md).
  - `src/lean/`: talking to Lean (`lean.ts`) and grading (`grade.ts`).
  - `src/core.ts`: the Rust core, loaded from `core.wasm`.
  - `src/ui/`: screens. `src/store.ts`: progress in localStorage.
  - `public/lean-worker.js`: Lean in a Web Worker. `public/sw.js`: the service worker.
- `core/`: the Rust core, compiled to `wasm32-unknown-unknown`. `no_std`, **zero dependencies**,
  **no reachable panics**. Spaced repetition (Leitner boxes 0, 1, 3, 7, 14 days), streaks, XP, levels,
  bracket checking and template filling.
- `scripts/`: building, fetching Lean, checking content, the end-to-end test, the art.
- `art/`: the icon's source. `bun scripts/art.ts` renders every icon and the link preview card.

## Lean in the browser

Core Lean 4 (the `Init` library, no Mathlib), compiled to WebAssembly: cauli's build of the
[cauli/lean4](https://github.com/cauli/lean4) fork, the same files LeanCards used.
About 48 MB, pinned file by file by SHA-256 in `scripts/lean.lock`. It ships with the site, and the
service worker caches it on the first visit, so later visits boot Lean from disk in about 2 seconds.

Two things it needs, and how they're handled:

1. **Cross-origin isolation.** Lean uses `SharedArrayBuffer`, which needs COOP/COEP headers, which
   GitHub Pages can't send. `sw.js` adds them to every response. A first visit reloads once while the
   service worker takes over.
2. **Syntax errors.** This Lean build's compile entry point (`lean_wasm_compile`) loses parse errors: its
   command loop reads the message log after the elaborator has reset it. So `lean-worker.js` runs a second
   pass, Lean's own parser (`Lean.Parser.testParseModule`), against the environment the compile already
   imported, by calling the module's exports directly. It costs about a millisecond.

Every check also runs `#print axioms` on each declaration, so a proof that leans on `sorry`, or a
declaration that never got made, can't pass.

## No panics, enforced

1. Clippy denies every panic source: `unwrap`, `expect`, indexing, unchecked arithmetic, `panic!`,
   slicing, division and so on (`core/Cargo.toml`).
2. Outside tests the crate is `no_std`, and its `#[panic_handler]` calls a function nothing defines. If the
   optimizer can't prove a panic unreachable, linking `core.wasm` fails with
   `undefined symbol: proofreps_core_has_a_reachable_panic`. That catches what clippy can't see, like the
   bounds checks inside `str::find`. `scripts/check-no-panic.ts` then checks that the module imports nothing.

## Develop

Needs: bun, rustup, Chrome. [blaze](https://github.com/indexable-inc/blaze) for the Rust loop.

```sh
./scripts/fetch-lean.sh            # the Lean runtime, into app/public/lean (pinned)
./scripts/build-core.sh            # Rust → app/public/core.wasm (clippy + the panic gate)
cd app && bun install
bun run build                      # → app/dist
bun ../scripts/serve.ts            # http://localhost:8790/ProofReps/, served like GitHub Pages
```

The Rust core, with blaze:

```sh
cd core
blaze test                         # incremental: reruns only what an edit touched
BLAZE_TESTS=all blaze test         # everything
```

blaze builds for the host only, so the wasm build is cargo's (`scripts/build-core.sh`, toolchain pinned
in `core/rust-toolchain.toml`).

Checks:

```sh
bun scripts/verify.ts              # every exercise against real Lean: solutions pass, wrong answers fail
bun scripts/verify.ts u05          # one unit
bun scripts/e2e.ts --shots /tmp/s  # the built site in headless Chrome at phone size
bun scripts/headless-lean.ts f.lean   # run any Lean file through the same Lean, print every message
```

## Ship and update

Push to `main`. `.github/workflows/deploy.yml` tests the core with blaze, builds it, fetches Lean,
checks every exercise against Lean, builds the site, runs the end-to-end test, and deploys to GitHub
Pages. The site is a project page of `tlehman.github.io`, so it's served at
`https://tobilehman.com/ProofReps`.

People with the app open get the new version on their next visit. If it's open when a deploy lands,
the service worker offers a reload. To change the Lean runtime on purpose: delete `scripts/lean.lock`,
point `LEAN_SRC` at the new files, run `fetch-lean.sh`, upload the files to the `lean-runtime` release,
and commit the new lock.

On a phone, "Add to Home Screen" gives a full-screen app with the ⊢💪 icon.

## Credits

- Lean 4 (Apache-2.0). WebAssembly build: cauli's `cauli/lean4` fork. `lean-worker.js` is adapted from
  `@live-codes/lean-wasm` (MIT), itself derived from cauli/lean4-wasm-in-browser (Apache-2.0).
- The flexed biceps in the icon is from [Noto Emoji](https://github.com/googlefonts/noto-emoji) (Apache-2.0).
