//! Chunk-level progress for whole-chip reads, so a dropped probe costs one chunk
//! instead of the dump.
//!
//! A 32 MB read needs minutes of unbroken contact. A hand-held or marginally
//! clamped probe on a leadless package does not reliably give minutes -- in
//! practice it gives tens of seconds. Without resume those two numbers have to
//! meet or the user never gets a backup at all, and "no backup" is what makes a
//! reflash lose the board's MAC forever. With resume they do not have to meet:
//! each attempt keeps the chunks it completed, and enough attempts add up to a
//! full dump no matter how short each one is.
//!
//! The sidecar records WHICH chunks are already correct. It is deliberately
//! paranoid about staleness: a resume that silently mixed two different chips'
//! bytes into one file would be a corrupt backup that looks perfect, which is the
//! exact failure this whole subsystem exists to prevent. Chip id, total size and
//! chunk size must all match or the sidecar is ignored and the read starts fresh.

use std::path::{Path, PathBuf};

const MAGIC: &str = "ratchet-resume v1";

/// Which chunks of a whole-chip read are already in the output file.
#[derive(Debug, Clone, PartialEq)]
pub struct ResumeState {
    pub jedec: String,
    pub size: u64,
    pub chunk: u32,
    pub done: Vec<bool>,
}

/// Sidecar path for an output file: `dump.bin` -> `dump.bin.ratchet-resume`.
pub fn resume_path(output: &Path) -> PathBuf {
    let mut s = output.as_os_str().to_os_string();
    s.push(".ratchet-resume");
    PathBuf::from(s)
}

impl ResumeState {
    pub fn fresh(jedec: &str, size: u64, chunk: u32) -> Self {
        let n = size.div_ceil(chunk as u64) as usize;
        Self {
            jedec: jedec.to_string(),
            size,
            chunk,
            done: vec![false; n],
        }
    }

    pub fn completed_bytes(&self) -> u64 {
        self.done
            .iter()
            .enumerate()
            .filter(|(_, d)| **d)
            .map(|(i, _)| {
                let start = i as u64 * self.chunk as u64;
                (self.size - start).min(self.chunk as u64)
            })
            .sum()
    }

    pub fn all_done(&self) -> bool {
        self.done.iter().all(|d| *d)
    }

    pub fn serialize(&self) -> String {
        let bits: String = self
            .done
            .iter()
            .map(|d| if *d { '1' } else { '0' })
            .collect();
        format!(
            "{MAGIC}\n{}\n{}\n{}\n{}\n",
            self.jedec, self.size, self.chunk, bits
        )
    }

    /// Parse a sidecar, returning None for anything that does not describe THIS
    /// read of THIS chip. Every mismatch is a hard reject rather than a
    /// best-effort merge: resuming onto a different chip, a different capacity or
    /// a different chunk stride would interleave unrelated bytes into a file the
    /// user would then trust as a backup.
    pub fn parse(text: &str, jedec: &str, size: u64, chunk: u32) -> Option<Self> {
        let mut lines = text.lines();
        if lines.next()? != MAGIC {
            return None;
        }
        let got_jedec = lines.next()?;
        let got_size: u64 = lines.next()?.parse().ok()?;
        let got_chunk: u32 = lines.next()?.parse().ok()?;
        let bits = lines.next()?;
        if got_jedec != jedec || got_size != size || got_chunk != chunk {
            return None;
        }
        let expect = size.div_ceil(chunk as u64) as usize;
        if bits.len() != expect || !bits.chars().all(|c| c == '0' || c == '1') {
            return None;
        }
        Some(Self {
            jedec: got_jedec.to_string(),
            size: got_size,
            chunk: got_chunk,
            done: bits.chars().map(|c| c == '1').collect(),
        })
    }

    /// Load progress for a read of `jedec`/`size` into `output`. Returns a fresh
    /// (nothing-done) state unless the sidecar AND the partial file both exist and
    /// agree -- a sidecar claiming progress with no file to back it is a lie, and
    /// the safe reading of a lie is "start over".
    pub fn load(output: &Path, jedec: &str, size: u64, chunk: u32) -> (Self, Option<Vec<u8>>) {
        let fresh = Self::fresh(jedec, size, chunk);
        let Ok(text) = std::fs::read_to_string(resume_path(output)) else {
            return (fresh, None);
        };
        let Some(state) = Self::parse(&text, jedec, size, chunk) else {
            return (fresh, None);
        };
        match std::fs::read(output) {
            Ok(buf) if buf.len() as u64 == size => (state, Some(buf)),
            _ => (fresh, None),
        }
    }

    pub fn save(&self, output: &Path) -> std::io::Result<()> {
        std::fs::write(resume_path(output), self.serialize())
    }

    /// Drop the sidecar once the dump is complete: a leftover file would make the
    /// next read of the same path look partially done.
    pub fn clear(output: &Path) {
        let _ = std::fs::remove_file(resume_path(output));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_through_serialize_and_parse() {
        let mut s = ResumeState::fresh("ef6019", 1024, 256);
        s.done[0] = true;
        s.done[2] = true;
        let back = ResumeState::parse(&s.serialize(), "ef6019", 1024, 256).unwrap();
        assert_eq!(back, s);
    }

    #[test]
    fn completed_bytes_counts_a_short_final_chunk_correctly() {
        // 300 bytes at chunk 256 => chunks of 256 and 44.
        let mut s = ResumeState::fresh("ef6019", 300, 256);
        s.done[1] = true;
        assert_eq!(
            s.completed_bytes(),
            44,
            "final chunk is short, not a full 256"
        );
        s.done[0] = true;
        assert_eq!(s.completed_bytes(), 300);
        assert!(s.all_done());
    }

    // Every one of these mismatches, if accepted, produces a file that is a blend
    // of two different reads and looks like a valid backup. Rejecting is the
    // whole point of the sidecar carrying identity at all.
    #[test]
    fn refuses_a_sidecar_from_a_different_chip() {
        let s = ResumeState::fresh("ef6019", 1024, 256);
        assert!(
            ResumeState::parse(&s.serialize(), "ef4018", 1024, 256).is_none(),
            "a sidecar from another chip must never resume onto this one"
        );
    }

    #[test]
    fn refuses_a_sidecar_with_a_different_size_or_chunk_stride() {
        let s = ResumeState::fresh("ef6019", 1024, 256);
        assert!(ResumeState::parse(&s.serialize(), "ef6019", 2048, 256).is_none());
        assert!(ResumeState::parse(&s.serialize(), "ef6019", 1024, 512).is_none());
    }

    #[test]
    fn refuses_garbage_and_wrong_length_bitmaps() {
        assert!(ResumeState::parse("nonsense", "ef6019", 1024, 256).is_none());
        let bad = format!("{MAGIC}\nef6019\n1024\n256\n0110\n"); // want 4 chunks, but check length
        assert!(
            ResumeState::parse(&bad, "ef6019", 1024, 256).is_some(),
            "1024/256 = 4 chunks, so a 4-bit map is correct"
        );
        let short = format!("{MAGIC}\nef6019\n1024\n256\n01\n");
        assert!(ResumeState::parse(&short, "ef6019", 1024, 256).is_none());
        let nonbinary = format!("{MAGIC}\nef6019\n1024\n256\n01x1\n");
        assert!(ResumeState::parse(&nonbinary, "ef6019", 1024, 256).is_none());
    }

    #[test]
    fn load_ignores_a_sidecar_whose_partial_file_is_missing() {
        let dir = std::env::temp_dir().join("ratchet-resume-test");
        std::fs::create_dir_all(&dir).unwrap();
        let out = dir.join("no-partial.bin");
        std::fs::remove_file(&out).ok();
        let mut s = ResumeState::fresh("ef6019", 1024, 256);
        s.done[0] = true;
        s.save(&out).unwrap();
        let (loaded, buf) = ResumeState::load(&out, "ef6019", 1024, 256);
        assert!(buf.is_none());
        assert!(
            !loaded.done[0],
            "a sidecar claiming progress with no file behind it must start over"
        );
        ResumeState::clear(&out);
    }
}
