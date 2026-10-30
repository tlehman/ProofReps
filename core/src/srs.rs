//! Spaced repetition, streaks and XP.
//!
//! The schedule is the one LeanCards used (boxes 0..=4, due in 0, 1, 3, 7, 14
//! days), so an old `progress.db` imports with its due dates intact.
//! Times are milliseconds since the epoch; days are local day numbers, which
//! the app computes because only it knows the time zone.

/// One day in milliseconds.
pub const DAY_MS: i64 = 86_400_000;
/// The last Leitner box.
pub const MAX_BOX: u8 = 4;

/// Days until a card in `bx` comes back.
pub const fn interval_days(bx: u8) -> i64 {
    match bx {
        0 => 0,
        1 => 1,
        2 => 3,
        3 => 7,
        _ => 14,
    }
}

/// The box after an answer. A miss resets the box, and so does solving right
/// after a miss: that card has to be earned again.
pub fn next_box(prev: u8, correct: bool, after_miss: bool) -> u8 {
    if correct && !after_miss { prev.saturating_add(1).min(MAX_BOX) } else { 0 }
}

/// When a card in box `bx` is next due. Solved right after a miss: tomorrow.
pub fn due_ms(now_ms: i64, bx: u8, after_miss: bool) -> i64 {
    let days = if after_miss { 1 } else { interval_days(bx) };
    now_ms.saturating_add(days.saturating_mul(DAY_MS))
}

/// The streak after practicing on `today`, given the last day practiced and
/// the streak as of then. `last_day < 0` means never.
pub fn streak_after_practice(last_day: i64, streak: u32, today: i64) -> u32 {
    if last_day == today {
        streak.max(1)
    } else if last_day >= 0 && last_day.checked_add(1) == Some(today) {
        streak.saturating_add(1)
    } else {
        1
    }
}

/// The streak to show on `today`. Not having practiced yet today doesn't
/// break it; missing yesterday does.
pub fn streak_today(last_day: i64, streak: u32, today: i64) -> u32 {
    if last_day >= 0 && (last_day == today || last_day.checked_add(1) == Some(today)) { streak } else { 0 }
}

/// Card kinds, as the app numbers them.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Kind {
    /// Pick one of four.
    Choice,
    /// Fill one hole.
    Fill,
    /// A whole proof.
    Boss,
}

impl Kind {
    /// From the app's numbering; anything unknown counts as a choice card.
    pub const fn from_u8(k: u8) -> Kind {
        match k {
            1 => Kind::Fill,
            2 => Kind::Boss,
            _ => Kind::Choice,
        }
    }
}

/// XP for one answer: a wrong answer earns nothing, a fix after a miss earns half.
pub const fn xp(kind: Kind, correct: bool, after_miss: bool) -> u32 {
    let base: u32 = match kind {
        Kind::Choice => 10,
        Kind::Fill => 15,
        Kind::Boss => 30,
    };
    if !correct {
        0
    } else if after_miss {
        base >> 1
    } else {
        base
    }
}

/// Bonus XP for finishing a lesson: 10 for no mistakes, 5 otherwise.
pub const fn lesson_bonus(mistakes: u32) -> u32 {
    if mistakes == 0 { 10 } else { 5 }
}

/// A card's status, as the app numbers them (the `status` column).
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Status {
    /// Never shown.
    New,
    /// Shown, never answered.
    Seen,
    /// Last answer was right.
    Correct,
    /// Last answer was wrong.
    Wrong,
    /// "I know this": never scheduled.
    Skipped,
}

impl Status {
    /// From the app's numbering; anything unknown counts as new.
    pub const fn from_u8(s: u8) -> Status {
        match s {
            1 => Status::Seen,
            2 => Status::Correct,
            3 => Status::Wrong,
            4 => Status::Skipped,
            _ => Status::New,
        }
    }
}

/// Total XP at which `level` starts. Level 1 starts at 0, and each level takes
/// 50 XP more than the one before: 0, 50, 150, 300, ...
pub const fn level_start(level: u32) -> u64 {
    let n = level as u64;
    25u64.saturating_mul(n).saturating_mul(n.saturating_sub(1))
}

/// The level for a total XP. Never below 1.
pub fn level(xp: u64) -> u32 {
    let mut lo: u32 = 1;
    let mut hi: u32 = 1 << 20; // level_start(hi) far exceeds any reachable XP
    while lo < hi {
        let mid = lo.saturating_add(hi.saturating_sub(lo).saturating_add(1) >> 1);
        if level_start(mid) <= xp { lo = mid } else { hi = mid.saturating_sub(1) }
    }
    lo
}

const TIER: i64 = 1 << 32;
const KEY_MAX: i64 = TIER - 1;

/// Where a card goes in today's lesson: lower comes first, and a negative rank
/// means it stays out. Missed cards that are due come first (in course order),
/// then due reviews (most overdue first), then new cards (in course order).
pub fn rank(status: Status, due_ms: i64, now_ms: i64, order: u32) -> i64 {
    let order = i64::from(order).min(KEY_MAX);
    let due = due_ms <= now_ms;
    match status {
        Status::Skipped => -1,
        Status::Wrong if due => order,
        Status::Correct if due => {
            let days_overdue = now_ms.saturating_sub(due_ms).checked_div(DAY_MS).unwrap_or(0);
            TIER.saturating_add(KEY_MAX.saturating_sub(days_overdue.clamp(0, KEY_MAX)))
        }
        Status::New | Status::Seen => TIER.saturating_mul(2).saturating_add(order),
        Status::Wrong | Status::Correct => -1,
    }
}

#[cfg(test)]
#[allow(clippy::arithmetic_side_effects)]
mod tests {
    use super::*;

    #[test]
    fn boxes_climb_and_reset() {
        assert_eq!(next_box(0, true, false), 1);
        assert_eq!(next_box(3, true, false), 4);
        assert_eq!(next_box(4, true, false), 4);
        assert_eq!(next_box(255, true, false), 4);
        assert_eq!(next_box(3, false, false), 0);
        assert_eq!(next_box(3, true, true), 0);
    }

    #[test]
    fn due_dates_match_leancards() {
        let now = 1_700_000_000_000;
        assert_eq!(due_ms(now, 0, false), now);
        assert_eq!(due_ms(now, 2, false), now + 3 * DAY_MS);
        assert_eq!(due_ms(now, 4, false), now + 14 * DAY_MS);
        assert_eq!(due_ms(now, 0, true), now + DAY_MS);
        assert_eq!(due_ms(i64::MAX - 5, 4, false), i64::MAX);
    }

    #[test]
    fn streaks() {
        assert_eq!(streak_after_practice(-1, 0, 100), 1);
        assert_eq!(streak_after_practice(99, 4, 100), 5);
        assert_eq!(streak_after_practice(100, 5, 100), 5);
        assert_eq!(streak_after_practice(97, 5, 100), 1);
        assert_eq!(streak_today(99, 5, 100), 5);
        assert_eq!(streak_today(100, 5, 100), 5);
        assert_eq!(streak_today(98, 5, 100), 0);
        assert_eq!(streak_today(-1, 5, 100), 0);
        assert_eq!(streak_after_practice(i64::MAX, 3, i64::MIN), 1);
    }

    #[test]
    fn xp_rules() {
        assert_eq!(xp(Kind::Boss, true, false), 30);
        assert_eq!(xp(Kind::Fill, true, true), 7);
        assert_eq!(xp(Kind::Choice, false, false), 0);
        assert_eq!(lesson_bonus(0), 10);
        assert_eq!(lesson_bonus(2), 5);
    }

    #[test]
    fn levels() {
        assert_eq!(level(0), 1);
        assert_eq!(level(49), 1);
        assert_eq!(level(50), 2);
        assert_eq!(level(149), 2);
        assert_eq!(level(150), 3);
        assert!(level_start(level(10_000)) <= 10_000);
        assert!(level_start(level(10_000) + 1) > 10_000);
        assert!(level(u64::MAX) >= 1);
    }

    #[test]
    fn lesson_order() {
        let now = 10 * DAY_MS;
        let missed = rank(Status::Wrong, now, now, 7);
        let overdue = rank(Status::Correct, now - 5 * DAY_MS, now, 0);
        let barely = rank(Status::Correct, now, now, 0);
        let fresh = rank(Status::New, 0, now, 0);
        assert!(0 <= missed && missed < overdue && overdue < barely && barely < fresh);
        assert_eq!(rank(Status::Correct, now + 1, now, 0), -1);
        assert_eq!(rank(Status::Skipped, 0, now, 0), -1);
        assert!(rank(Status::Correct, i64::MIN, i64::MAX, u32::MAX) >= 0);
    }
}
