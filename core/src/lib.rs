//! ProofReps' core, compiled to `wasm32-unknown-unknown` and loaded by the web app.
//!
//! - [`srs`]: Leitner boxes, due dates, streaks, XP, levels, and the order a
//!   lesson draws its exercises in. Pure functions of numbers.
//! - [`text`]: the text work around a Lean answer: checking brackets before
//!   Lean sees it, and filling an exercise template's `___` hole.
//! - [`wasm`]: the exports the app calls. Numbers in and out, strings through
//!   two fixed buffers in linear memory, so there is nothing to marshal and no
//!   allocator.
//!
//! **No panics.** Outside tests the crate is `no_std` and its panic handler
//! calls a function that nothing provides. On wasm that becomes an *import*,
//! and the finished module must have no imports at all: if any panic path
//! survives optimization, `scripts/check-no-panic.ts` (run by every build)
//! fails. Clippy's panic lints (Cargo.toml) catch most of them before that.
#![cfg_attr(not(test), no_std)]

pub mod srs;
pub mod text;
pub mod wasm;

#[cfg(not(test))]
#[panic_handler]
fn panic(_: &core::panic::PanicInfo) -> ! {
    unsafe extern "C" {
        // Deliberately undefined: see the crate docs.
        fn proofreps_core_has_a_reachable_panic() -> !;
    }
    // SAFETY: never called in a correct build; the no-panic check fails first
    // if this function is reachable at all.
    unsafe { proofreps_core_has_a_reachable_panic() }
}
