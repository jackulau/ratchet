// Plugin system stub. The TS version dynamically imports JS modules — Rust
// can't do that without an embedded JS runtime. Two paths forward (D17 scope
// is just the surface):
//   1. Shell-out to an external script (deliberately rejected — goal forbids exec/spawn).
//   2. Statically compiled Rust plugin trait; users link extra crates against biospy-core.
// We expose the trait so the CLI's `plugin` subcommand can be wired in D18.

use crate::types::{ChipInfo, JedecId, StatusRegisters};

/// Context handed to plugin entry-points. Plugins implement [`Plugin::run`].
pub trait PluginContext {
    fn log(&mut self, msg: &str);
    fn warn(&mut self, msg: &str);
    fn fail(&mut self, msg: &str);
    fn identify(&mut self) -> Result<Option<ChipInfo>, String>;
    fn read_jedec(&mut self) -> Result<JedecId, String>;
    fn read_status(&mut self) -> Result<StatusRegisters, String>;
}

pub trait Plugin: Send + Sync {
    fn name(&self) -> &'static str;
    fn run(&self, ctx: &mut dyn PluginContext) -> Result<(), String>;
}

/// In-memory plugin registry; CLI binary will populate this from built-in
/// Rust plugins (no dynamic loading).
#[derive(Default)]
pub struct PluginRegistry {
    plugins: Vec<Box<dyn Plugin>>,
}

impl PluginRegistry {
    pub fn new() -> Self {
        Self::default()
    }
    pub fn register(&mut self, p: Box<dyn Plugin>) {
        self.plugins.push(p);
    }
    pub fn list(&self) -> Vec<&'static str> {
        self.plugins.iter().map(|p| p.name()).collect()
    }
    pub fn find(&self, name: &str) -> Option<&dyn Plugin> {
        self.plugins
            .iter()
            .find(|p| p.name() == name)
            .map(|p| p.as_ref())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct DummyPlugin;
    impl Plugin for DummyPlugin {
        fn name(&self) -> &'static str {
            "dummy"
        }
        fn run(&self, _ctx: &mut dyn PluginContext) -> Result<(), String> {
            Ok(())
        }
    }

    struct StubCtx {
        logs: Vec<String>,
    }
    impl PluginContext for StubCtx {
        fn log(&mut self, m: &str) {
            self.logs.push(format!("log:{m}"));
        }
        fn warn(&mut self, m: &str) {
            self.logs.push(format!("warn:{m}"));
        }
        fn fail(&mut self, m: &str) {
            self.logs.push(format!("fail:{m}"));
        }
        fn identify(&mut self) -> Result<Option<ChipInfo>, String> {
            Ok(None)
        }
        fn read_jedec(&mut self) -> Result<JedecId, String> {
            Ok(JedecId {
                manufacturer: 0,
                memory_type: 0,
                capacity: 0,
            })
        }
        fn read_status(&mut self) -> Result<StatusRegisters, String> {
            Ok(StatusRegisters {
                sr1: 0,
                sr2: 0,
                sr3: 0,
            })
        }
    }

    #[test]
    fn registry_lists_and_finds_plugins() {
        let mut reg = PluginRegistry::new();
        reg.register(Box::new(DummyPlugin));
        assert_eq!(reg.list(), vec!["dummy"]);
        assert!(reg.find("dummy").is_some());
        assert!(reg.find("missing").is_none());
    }

    #[test]
    fn plugin_run_receives_ctx() {
        let p = DummyPlugin;
        let mut ctx = StubCtx { logs: vec![] };
        p.run(&mut ctx).unwrap();
    }
}
