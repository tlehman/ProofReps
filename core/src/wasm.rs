//! The exports the web app calls (`app/src/core.ts` is the other side).
//!
//! Numbers cross as wasm numbers: times and day numbers as `f64` (what
//! JavaScript has; converting to `i64` saturates), booleans as `u32`. Strings
//! cross through two fixed buffers in linear memory: the app writes UTF-8 into
//! [`pr_in_ptr`] and reads results from [`pr_out_ptr`]. No allocator, so no
//! allocation failure to handle.

use crate::{srs, text};
use core::cell::UnsafeCell;

const IN_CAP: usize = 1 << 17;
const OUT_CAP: usize = 1 << 18;

#[repr(C, align(8))]
struct Buf<const N: usize>(UnsafeCell<[u8; N]>);

// SAFETY: wasm32-unknown-unknown without the atomics feature is single
// threaded, and every export below finishes with its borrows before returning.
unsafe impl<const N: usize> Sync for Buf<N> {}

static IN: Buf<IN_CAP> = Buf(UnsafeCell::new([0; IN_CAP]));
static OUT: Buf<OUT_CAP> = Buf(UnsafeCell::new([0; OUT_CAP]));

fn input(start: u32, len: u32) -> Option<&'static str> {
    // SAFETY: single threaded (see `Buf`), and no export holds a mutable
    // borrow of `IN`; JavaScript writes it only between calls.
    let buf: &[u8; IN_CAP] = unsafe { &*IN.0.get() };
    let start = usize::try_from(start).ok()?;
    let end = start.checked_add(usize::try_from(len).ok()?)?;
    core::str::from_utf8(buf.get(start..end)?).ok()
}

fn output() -> &'static mut [u8; OUT_CAP] {
    // SAFETY: single threaded (see `Buf`), and each export takes this borrow
    // at most once and drops it before returning.
    unsafe { &mut *OUT.0.get() }
}

/// Where the app writes UTF-8 input.
#[unsafe(no_mangle)]
pub extern "C" fn pr_in_ptr() -> *mut u8 {
    IN.0.get().cast()
}

/// How many bytes fit at [`pr_in_ptr`].
#[unsafe(no_mangle)]
pub extern "C" fn pr_in_cap() -> u32 {
    IN_CAP as u32
}

/// Where results are written.
#[unsafe(no_mangle)]
pub extern "C" fn pr_out_ptr() -> *const u8 {
    OUT.0.get().cast()
}

/// Checks the brackets in the `len` bytes at [`pr_in_ptr`]. Returns 0 for
/// balanced, 1 unclosed, 2 stray closer, 3 mismatch, 255 for invalid input.
/// For 1 to 3, writes three little-endian `u32`s to [`pr_out_ptr`]: the char
/// index, the open bracket, and the closing bracket (0 when there isn't one).
#[unsafe(no_mangle)]
pub extern "C" fn pr_brackets(len: u32) -> u32 {
    let Some(src) = input(0, len) else { return 255 };
    let (kind, at, open, close) = match text::brackets(src) {
        text::Brackets::Balanced => return 0,
        text::Brackets::Unclosed { open, at } => (1, at, open, '\0'),
        text::Brackets::Stray { close, at } => (2, at, '\0', close),
        text::Brackets::Mismatch { open, close, at } => (3, at, open, close),
    };
    let mut sink = text::Sink::new(output());
    let wrote = sink
        .push(&at.to_le_bytes())
        .and_then(|()| sink.push(&u32::from(open).to_le_bytes()))
        .and_then(|()| sink.push(&u32::from(close).to_le_bytes()));
    if wrote.is_some() { kind } else { 255 }
}

/// Fills the template (the first `template_len` bytes at [`pr_in_ptr`]) with
/// the answer (the next `answer_len` bytes); see [`text::fill`]. Returns the
/// length written at [`pr_out_ptr`], or -1 (no hole, bad UTF-8, too long).
#[unsafe(no_mangle)]
pub extern "C" fn pr_fill(template_len: u32, answer_len: u32) -> i32 {
    let (Some(template), Some(answer)) = (input(0, template_len), input(template_len, answer_len)) else {
        return -1;
    };
    let mut sink = text::Sink::new(output());
    match text::fill(template, answer, &mut sink) {
        Some(()) => i32::try_from(sink.len()).unwrap_or(-1),
        None => -1,
    }
}

/// See [`srs::next_box`].
#[unsafe(no_mangle)]
pub extern "C" fn pr_next_box(prev: u32, correct: u32, after_miss: u32) -> u32 {
    u32::from(srs::next_box(u8::try_from(prev).unwrap_or(u8::MAX), correct != 0, after_miss != 0))
}

/// See [`srs::due_ms`].
#[unsafe(no_mangle)]
pub extern "C" fn pr_due_ms(now_ms: f64, bx: u32, after_miss: u32) -> f64 {
    srs::due_ms(now_ms as i64, u8::try_from(bx).unwrap_or(u8::MAX), after_miss != 0) as f64
}

/// See [`srs::streak_after_practice`].
#[unsafe(no_mangle)]
pub extern "C" fn pr_streak_after_practice(last_day: f64, streak: u32, today: f64) -> u32 {
    srs::streak_after_practice(last_day as i64, streak, today as i64)
}

/// See [`srs::streak_today`].
#[unsafe(no_mangle)]
pub extern "C" fn pr_streak_today(last_day: f64, streak: u32, today: f64) -> u32 {
    srs::streak_today(last_day as i64, streak, today as i64)
}

/// See [`srs::xp`]. `kind`: 0 choice, 1 fill, 2 proof.
#[unsafe(no_mangle)]
pub extern "C" fn pr_xp(kind: u32, correct: u32, after_miss: u32) -> u32 {
    srs::xp(srs::Kind::from_u8(u8::try_from(kind).unwrap_or(0)), correct != 0, after_miss != 0)
}

/// See [`srs::lesson_bonus`].
#[unsafe(no_mangle)]
pub extern "C" fn pr_lesson_bonus(mistakes: u32) -> u32 {
    srs::lesson_bonus(mistakes)
}

/// See [`srs::level`].
#[unsafe(no_mangle)]
pub extern "C" fn pr_level(xp: f64) -> u32 {
    srs::level(xp as u64)
}

/// See [`srs::level_start`].
#[unsafe(no_mangle)]
pub extern "C" fn pr_level_start(level: u32) -> f64 {
    srs::level_start(level) as f64
}

/// See [`srs::rank`]. `status`: 0 new, 1 seen, 2 correct, 3 wrong, 4 skipped.
#[unsafe(no_mangle)]
pub extern "C" fn pr_rank(status: u32, due_ms: f64, now_ms: f64, order: u32) -> f64 {
    srs::rank(srs::Status::from_u8(u8::try_from(status).unwrap_or(0)), due_ms as i64, now_ms as i64, order) as f64
}
