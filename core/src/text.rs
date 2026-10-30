//! The text work around a Lean answer.
//!
//! Lean recovers from a missing or extra closing bracket without leaving a
//! `sorry` behind, so [`brackets`] checks them before Lean sees the answer and
//! can point at the exact character. [`fill`] puts a (possibly multi-line)
//! answer into an exercise template's `___` hole.

/// What [`brackets`] found.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Brackets {
    /// Every bracket is closed by its partner.
    Balanced,
    /// `open` at char index `at` is never closed.
    Unclosed {
        /// The bracket.
        open: char,
        /// Char index into the answer.
        at: u32,
    },
    /// `close` at char index `at` closes nothing.
    Stray {
        /// The bracket.
        close: char,
        /// Char index into the answer.
        at: u32,
    },
    /// `open` is closed by the wrong bracket, `close` at char index `at`.
    Mismatch {
        /// The bracket that is open.
        open: char,
        /// The bracket that tried to close it.
        close: char,
        /// Char index of `close`.
        at: u32,
    },
}

const fn partner(open: char) -> Option<char> {
    match open {
        '(' => Some(')'),
        '[' => Some(']'),
        '{' => Some('}'),
        '⟨' => Some('⟩'),
        '⦃' => Some('⦄'),
        '«' => Some('»'),
        _ => None,
    }
}

const fn is_closer(c: char) -> bool {
    matches!(c, ')' | ']' | '}' | '⟩' | '⦄' | '»')
}

const fn is_ident(c: char) -> bool {
    c.is_ascii_alphanumeric() || matches!(c, '_' | '\'' | '!' | '?') || (c as u32) > 0x7f
}

/// The deepest nesting [`brackets`] tracks. Deeper input is reported as
/// unclosed at the bracket that overflowed, which no real answer reaches.
const MAX_DEPTH: usize = 256;

/// Checks that the brackets in Lean source pair up, skipping comments
/// (`--`, nested `/- -/`), string literals and char literals.
pub fn brackets(src: &str) -> Brackets {
    let mut stack: [(char, u32); MAX_DEPTH] = [('\0', 0); MAX_DEPTH];
    let mut depth: usize = 0;
    let mut chars = src.chars().peekable();
    let mut at: u32 = 0;
    let mut prev = '\n';
    while let Some(c) = chars.next() {
        let here = at;
        at = at.saturating_add(1);
        match c {
            '-' if chars.peek() == Some(&'-') => {
                for c in chars.by_ref() {
                    at = at.saturating_add(1);
                    if c == '\n' {
                        break;
                    }
                }
                prev = '\n';
                continue;
            }
            '/' if chars.peek() == Some(&'-') => {
                let mut nest: u32 = 1;
                let mut last = '\0';
                for c in chars.by_ref() {
                    at = at.saturating_add(1);
                    if last == '/' && c == '-' {
                        nest = nest.saturating_add(1);
                        last = '\0';
                    } else if last == '-' && c == '/' {
                        nest = nest.saturating_sub(1);
                        if nest == 0 {
                            break;
                        }
                        last = '\0';
                    } else {
                        last = c;
                    }
                }
                prev = ' ';
                continue;
            }
            '"' => {
                let mut escaped = false;
                for c in chars.by_ref() {
                    at = at.saturating_add(1);
                    if escaped {
                        escaped = false;
                    } else if c == '\\' {
                        escaped = true;
                    } else if c == '"' {
                        break;
                    }
                }
                prev = '"';
                continue;
            }
            // A char literal like '(' (but not a prime in `h'`).
            '\'' if !is_ident(prev) => {
                let mut look = chars.clone();
                let lit = match look.next() {
                    Some('\\') => look.next().and_then(|_| look.next()),
                    Some(_) => look.next(),
                    None => None,
                };
                if lit == Some('\'') {
                    while let Some(c) = chars.next() {
                        at = at.saturating_add(1);
                        if c == '\\' {
                            chars.next();
                            at = at.saturating_add(1);
                        } else if c == '\'' {
                            break;
                        }
                    }
                    prev = '\'';
                    continue;
                }
            }
            _ => {}
        }
        prev = c;
        if partner(c).is_some() {
            match stack.get_mut(depth) {
                Some(slot) => *slot = (c, here),
                None => return Brackets::Unclosed { open: c, at: here },
            }
            depth = depth.saturating_add(1);
        } else if is_closer(c) {
            let Some(top) = depth.checked_sub(1) else {
                return Brackets::Stray { close: c, at: here };
            };
            let Some(&(open, _)) = stack.get(top) else {
                return Brackets::Stray { close: c, at: here };
            };
            if partner(open) != Some(c) {
                return Brackets::Mismatch { open, close: c, at: here };
            }
            depth = top;
        }
    }
    match depth.checked_sub(1).and_then(|top| stack.get(top)) {
        Some(&(open, at)) => Brackets::Unclosed { open, at },
        None => Brackets::Balanced,
    }
}

/// A byte sink with a fixed capacity: writing past the end fails instead of
/// growing or panicking.
pub struct Sink<'a> {
    buf: &'a mut [u8],
    len: usize,
}

impl<'a> Sink<'a> {
    /// An empty sink over `buf`.
    pub fn new(buf: &'a mut [u8]) -> Self {
        Sink { buf, len: 0 }
    }

    /// Bytes written so far.
    pub fn len(&self) -> usize {
        self.len
    }

    /// Whether nothing has been written.
    pub fn is_empty(&self) -> bool {
        self.len == 0
    }

    /// Appends `bytes`, or returns `None` (writing nothing) if they don't fit.
    pub fn push(&mut self, bytes: &[u8]) -> Option<()> {
        let end = self.len.checked_add(bytes.len())?;
        self.buf.get_mut(self.len..end)?.copy_from_slice(bytes);
        self.len = end;
        Some(())
    }

    /// Appends `n` spaces.
    pub fn spaces(&mut self, n: usize) -> Option<()> {
        for _ in 0..n {
            self.push(b" ")?;
        }
        Some(())
    }
}

/// Puts `answer` into the first `___` in `template`, dedented, with
/// continuation lines indented to the hole's column so tactic blocks stay
/// aligned. Tabs count as two spaces. Returns `None` if there's no hole or
/// the result doesn't fit in `out`.
///
/// Works on bytes: `str`'s searching and trimming keep bounds checks the
/// optimizer can't remove, and those are panics (see the crate docs). Only
/// ASCII bytes are ever split on, so valid UTF-8 in is valid UTF-8 out.
pub fn fill(template: &str, answer: &str, out: &mut Sink<'_>) -> Option<()> {
    let template = template.as_bytes();
    let hole = template.windows(3).position(|w| w == b"___")?;
    let before = template.get(..hole)?;
    let after = template.get(hole.checked_add(3)?..)?;
    let line_start = before.iter().rposition(|&b| b == b'\n').map_or(0, |i| i.saturating_add(1));
    // The hole's column in chars: count the bytes that start one.
    let col = before.get(line_start..)?.iter().filter(|&&b| b & 0xc0 != 0x80).count();

    // Trailing whitespace and leading blank lines don't count.
    let answer = answer.as_bytes();
    let end = answer.iter().rposition(|b| !b.is_ascii_whitespace()).map_or(0, |i| i.saturating_add(1));
    let answer = answer.get(..end)?;
    let blank = |l: &[u8]| l.iter().all(u8::is_ascii_whitespace);
    let indent = |l: &[u8]| -> usize {
        l.iter()
            .take_while(|&&b| b == b' ' || b == b'\t')
            .map(|&b| if b == b'\t' { 2usize } else { 1 })
            .fold(0usize, usize::saturating_add)
    };
    let mut lines = Lines(answer).skip_while(|l| blank(l));
    let dedent = Lines(answer).filter(|l| !blank(l)).map(indent).min().unwrap_or(0);

    out.push(before)?;
    let mut first = true;
    for line in lines.by_ref() {
        if !first {
            out.push(b"\n")?;
            out.spaces(col)?;
        }
        first = false;
        // Drop `dedent` columns of leading whitespace, expanding tabs.
        let mut dropped = 0usize;
        let mut rest = line;
        while dropped < dedent {
            match rest.split_first() {
                Some((b' ', tail)) => (dropped, rest) = (dropped.saturating_add(1), tail),
                Some((b'\t', tail)) => (dropped, rest) = (dropped.saturating_add(2), tail),
                _ => break,
            }
        }
        // A tab that straddles the dedent leaves a space behind.
        out.spaces(dropped.saturating_sub(dedent))?;
        for &b in rest {
            if b == b'\t' { out.push(b"  ")? } else { out.push(&[b])? }
        }
    }
    out.push(after)
}

/// The lines of `bytes`, split on `\n` (without it).
struct Lines<'a>(&'a [u8]);

impl<'a> Iterator for Lines<'a> {
    type Item = &'a [u8];

    fn next(&mut self) -> Option<&'a [u8]> {
        if self.0.is_empty() {
            return None;
        }
        match self.0.iter().position(|&b| b == b'\n') {
            Some(i) => {
                let line = self.0.get(..i)?;
                self.0 = self.0.get(i.saturating_add(1)..).unwrap_or(&[]);
                Some(line)
            }
            None => Some(core::mem::take(&mut self.0)),
        }
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::indexing_slicing)]
mod tests {
    use super::*;

    #[test]
    fn balanced() {
        assert_eq!(brackets("⟨h.2, (h.1)⟩"), Brackets::Balanced);
        assert_eq!(brackets("exact foo -- )\n"), Brackets::Balanced);
        assert_eq!(brackets("/- ( /- ] -/ -/ rfl"), Brackets::Balanced);
        assert_eq!(brackets(r#"#eval "(\")""#), Brackets::Balanced);
        assert_eq!(brackets("#eval '(' :: []"), Brackets::Balanced);
        assert_eq!(brackets("exact h' (h'' x)"), Brackets::Balanced);
        assert_eq!(brackets(""), Brackets::Balanced);
    }

    #[test]
    fn unbalanced() {
        assert_eq!(brackets("exact (hp"), Brackets::Unclosed { open: '(', at: 6 });
        assert_eq!(brackets("⟨a, b)"), Brackets::Mismatch { open: '⟨', close: ')', at: 5 });
        assert_eq!(brackets("rfl)"), Brackets::Stray { close: ')', at: 3 });
        assert_eq!(brackets("⟨⟨a⟩"), Brackets::Unclosed { open: '⟨', at: 0 });
        assert!(matches!(brackets(&"(".repeat(1000)), Brackets::Unclosed { .. }));
    }

    fn filled(t: &str, a: &str) -> String {
        let mut buf = [0u8; 4096];
        let mut s = Sink::new(&mut buf);
        fill(t, a, &mut s).unwrap();
        let n = s.len();
        String::from_utf8(buf[..n].to_vec()).unwrap()
    }

    #[test]
    fn fills_holes() {
        assert_eq!(filled("theorem t : True := ___", "trivial"), "theorem t : True := trivial");
        assert_eq!(
            filled("example : p := by\n  ___\n", "\n\n    constructor\n    · exact a\n"),
            "example : p := by\n  constructor\n  · exact a\n"
        );
        assert_eq!(filled("  x := ___", "a\n\tb"), "  x := a\n         b");
        assert_eq!(filled("⟨___⟩", "a"), "⟨a⟩");
    }

    #[test]
    fn fill_fails_cleanly() {
        let mut buf = [0u8; 8];
        let mut s = Sink::new(&mut buf);
        assert_eq!(fill("no hole", "x", &mut s), None);
        assert_eq!(fill("theorem t : True := ___", "trivial", &mut s), None);
    }
}
