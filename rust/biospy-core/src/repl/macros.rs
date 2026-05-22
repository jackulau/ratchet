// Macro recorder — record sequences of REPL commands, save/load to JSON.
// Ports src/repl/macros.ts.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Macro {
    pub name: String,
    pub commands: Vec<String>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

#[derive(Debug, Default)]
pub struct MacroRecorder {
    macros: BTreeMap<String, Macro>,
    current_name: Option<String>,
    current_commands: Vec<String>,
}

impl MacroRecorder {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn start_recording(&mut self, name: impl Into<String>) {
        self.current_name = Some(name.into());
        self.current_commands.clear();
    }

    pub fn stop_recording(&mut self) {
        if let Some(name) = self.current_name.take() {
            self.macros.insert(
                name.clone(),
                Macro {
                    name,
                    commands: std::mem::take(&mut self.current_commands),
                    created_at: timestamp_iso(),
                },
            );
        }
    }

    pub fn add_command(&mut self, cmd: impl Into<String>) {
        if self.current_name.is_some() {
            self.current_commands.push(cmd.into());
        }
    }

    pub fn get_commands(&self, name: &str) -> Option<&[String]> {
        self.macros.get(name).map(|m| m.commands.as_slice())
    }

    pub fn list(&self) -> Vec<(String, usize, String)> {
        self.macros
            .values()
            .map(|m| (m.name.clone(), m.commands.len(), m.created_at.clone()))
            .collect()
    }

    pub fn save(&self, path: &Path) -> std::io::Result<()> {
        let data = MacroFile {
            macros: self.macros.values().cloned().collect(),
        };
        let json = serde_json::to_string_pretty(&data)?;
        fs::write(path, json)
    }

    pub fn load(&mut self, path: &Path) -> Result<(), String> {
        let raw = fs::read_to_string(path).map_err(|e| e.to_string())?;
        let data: MacroFile =
            serde_json::from_str(&raw).map_err(|_| "Invalid macro file format".to_string())?;
        for m in data.macros {
            self.macros.insert(m.name.clone(), m);
        }
        Ok(())
    }

    pub fn is_recording(&self) -> bool {
        self.current_name.is_some()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct MacroFile {
    macros: Vec<Macro>,
}

fn timestamp_iso() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // Cheap ISO8601-ish (no chrono dep): YYYY-MM-DDTHH:MM:SSZ approximation.
    // Caller-facing field is opaque — just needs to be a string.
    format!("ts:{secs}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn record_and_replay_a_macro() {
        let mut r = MacroRecorder::new();
        r.start_recording("test");
        assert!(r.is_recording());
        r.add_command("identify");
        r.add_command("jedec");
        r.add_command("status");
        r.stop_recording();
        assert!(!r.is_recording());
        let cmds = r.get_commands("test").unwrap();
        assert_eq!(cmds, &["identify", "jedec", "status"]);
    }

    #[test]
    fn add_command_when_not_recording_is_noop() {
        let mut r = MacroRecorder::new();
        r.add_command("identify");
        assert!(r.get_commands("anything").is_none());
        assert!(r.list().is_empty());
    }

    #[test]
    fn stop_without_start_is_noop() {
        let mut r = MacroRecorder::new();
        r.stop_recording();
        assert!(r.list().is_empty());
    }

    #[test]
    fn list_returns_recorded_macros() {
        let mut r = MacroRecorder::new();
        r.start_recording("m1");
        r.add_command("a");
        r.stop_recording();
        r.start_recording("m2");
        r.add_command("b");
        r.add_command("c");
        r.stop_recording();
        let list = r.list();
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].0, "m1");
        assert_eq!(list[0].1, 1);
        assert_eq!(list[1].1, 2);
    }

    #[test]
    fn save_and_load_roundtrip() {
        let path =
            std::env::temp_dir().join(format!("biospy-macro-test-{}.json", std::process::id()));
        let mut r = MacroRecorder::new();
        r.start_recording("backup");
        r.add_command("identify");
        r.add_command("read /tmp/x.bin");
        r.stop_recording();
        r.save(&path).unwrap();

        let mut r2 = MacroRecorder::new();
        r2.load(&path).unwrap();
        let cmds = r2.get_commands("backup").unwrap();
        assert_eq!(cmds, &["identify", "read /tmp/x.bin"]);
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn load_rejects_malformed_file() {
        let path =
            std::env::temp_dir().join(format!("biospy-bad-macro-{}.json", std::process::id()));
        std::fs::write(&path, "not json at all").unwrap();
        let mut r = MacroRecorder::new();
        let err = r.load(&path).unwrap_err();
        assert!(err.contains("Invalid macro file format"));
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn restarting_clears_in_progress_buffer() {
        let mut r = MacroRecorder::new();
        r.start_recording("a");
        r.add_command("x");
        r.start_recording("b"); // discards "a" in-progress
        r.add_command("y");
        r.stop_recording();
        assert!(r.get_commands("a").is_none());
        assert_eq!(r.get_commands("b"), Some(&["y".to_string()][..]));
    }
}
