# ProofReps ⊢💪

Daily reps for Lean 4 and formal methods: short lessons, a streak, XP, spaced review, and every
answer you type is checked by **real Lean 4, with all of Mathlib loaded**, on a server you run.

Anything Lean accepts is correct. The app never compares your answer to a stored one. Lean
shows its real syntax errors, type errors and goal states, at the cursor, as you type.

It grew out of LeanCards (`~/Archive/Projects/learn-lean`): same spaced-repetition schedule.

## Run it

```sh
scripts/start.sh
```

It builds whatever is missing or stale (Mathlib's prebuilt files on the first run, the Lean REPL,
the Rust core, the site), starts the server, waits for Lean to import Mathlib, puts the site on your
tailnet with `tailscale serve`, and prints the URL (`https://<machine>.<tailnet>.ts.net:8790/`).
Open that on your phone; "Add to Home Screen" gives a full-screen app with the ⊢💪 icon. Ctrl-C stops
the server and the `tailscale serve` entry.

Env: `PORT` (8790), `LEAN_WORKERS` (4), `LEAN_TIMEOUT_MS` (20000). `scripts/start.sh --rebuild` forces a
site rebuild.

Needs: bun, elan (Lean's toolchain manager), rustup, Tailscale, and bubblewrap (`bwrap`) for the
sandbox. Chrome only for the end-to-end test.

## Layout

- `server/`: the backend.
  - `lean/`: a Lake project pinning Lean (`lean-toolchain`), Mathlib and the
    [Lean REPL](https://github.com/leanprover-community/repl) to the same release.
  - `src/repl.ts`: one long-lived Lean REPL process, sandboxed.
  - `src/pool.ts`: a pool of warm REPLs with Mathlib imported. Used by the server, `verify` and the CLI.
  - `src/main.ts`: the HTTP server: the built app plus `POST /api/check` and `GET /api/status`.
- `app/`: the app. Expo / React Native, exported as a static web app (react-native-web).
  - `src/content/`: the course, one file per unit (`u01.ts` ...). How to write exercises:
    [`src/content/README.md`](app/src/content/README.md).
  - `src/lean/`: talking to the server (`lean.ts`) and grading (`grade.ts`).
  - `src/core.ts`: the Rust core, loaded from `core.wasm`.
  - `src/ui/`: screens. `src/store.ts`: progress in localStorage.
- `core/`: the Rust core, compiled to `wasm32-unknown-unknown`. `no_std`, **zero dependencies**,
  **no reachable panics**. Spaced repetition (Leitner boxes 0, 1, 3, 7, 14 days), streaks, XP, levels,
  bracket checking and template filling.
- `scripts/`: starting, building, checking content, the end-to-end test, the art.
- `art/`: the icon's source. `bun scripts/art.ts` renders every icon and the link preview card.

## Lean on the server

Each worker is a Lean REPL process that runs `import Mathlib` once, when the server boots (about 6 s,
all workers in parallel). After that, every check is a REPL command elaborated on top of that
environment, so it never pays for the import: an exercise or a goal probe takes about 10 to 20 ms of
Lean time, plus the network round trip.

- **Goal view.** As you type, the app checks your answer up to the cursor's line followed by
  `trace_state`, and shows the goals Lean prints there. Only the newest probe per channel is sent, and
  the server caches results (they're deterministic), so moving back to a line you've seen is instant.
- **Pool.** `LEAN_WORKERS` processes, each about 0.5 GB of private memory (the Mathlib `.olean` files are
  memory-mapped and shared between them). The REPL keeps every environment it makes, so a worker is
  replaced after 400 checks or 3 GB. The replacement boots before the old one is dropped.
- **Timeouts.** A check that runs past `LEAN_TIMEOUT_MS` (an `#eval` that loops, a huge `decide`) gets
  its worker killed and replaced, and comes back as a Lean error.
- **Sandbox.** Checked code can run `#eval` with `IO`, so each REPL runs under bubblewrap: no network,
  a read-only view of the Lean toolchain and `server/lean`, an empty throwaway `/tmp`, none of your other
  files. Without `bwrap` it runs unsandboxed and the server says so in its log and `/api/status`. The
  server listens on 127.0.0.1 only; `tailscale serve` makes it reachable from your tailnet, not the internet.
- **Imports.** Everything Mathlib imports is already loaded, so `import Mathlib...` lines in the
  playground are accepted and skipped. Anything else is reported as an unknown module.

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

```sh
./scripts/build-core.sh            # Rust → app/public/core.wasm (clippy + the panic gate)
cd app && bun install
bun run build                      # → app/dist
bun ../server/src/main.ts          # http://127.0.0.1:8790/
```

The Rust core, with blaze ([indexable-inc/blaze](https://github.com/indexable-inc/blaze)):

```sh
cd core
blaze test                         # incremental: reruns only what an edit touched
BLAZE_TESTS=all blaze test         # everything
```

blaze builds for the host only, so the wasm build is cargo's (`scripts/build-core.sh`, toolchain pinned
in `core/rust-toolchain.toml`).

Checks:

```sh
bun scripts/verify.ts              # every exercise against real Lean + Mathlib: solutions pass, wrong answers fail
bun scripts/verify.ts u05          # one unit
bun scripts/e2e.ts --shots /tmp/s  # the built site and the real server, in headless Chrome at phone size
bun scripts/lean.ts f.lean         # run any Lean file through the same Lean, print every message
```

To move to a new Lean release: change `server/lean/lean-toolchain` and the two `rev`s in
`server/lean/lakefile.toml` to the new tag, run `cd server/lean && lake update && lake exe cache get`,
then `bun scripts/verify.ts`.

## Credits

- Lean 4 (Apache-2.0), Mathlib (Apache-2.0), the Lean REPL (Apache-2.0).
- The flexed biceps in the icon is from [Noto Emoji](https://github.com/googlefonts/noto-emoji) (Apache-2.0).
