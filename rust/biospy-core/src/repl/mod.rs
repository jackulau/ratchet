// REPL state machines + macros + sniffer/watch event generators.
// Hardware-free — actual TTY loop (rustyline) lives in the CLI binary (D18).
// Pure logic here lets us unit-test the behavior without a real serial port.

pub mod macros;
pub mod plugins;
pub mod sniffer;
pub mod watch;

use serde::{Deserialize, Serialize};

/// Parsed REPL command — the CLI binary translates user lines into these.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum ReplCommand {
    Help,
    Identify,
    Jedec,
    Status,
    Read { path: String },
    Write { path: String },
    Erase,
    SectorErase { address: u32 },
    Reset,
    Quit,
    Macro { sub: MacroSub },
    Plugin { path: String },
    Unknown(String),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum MacroSub {
    Start(String),
    Stop,
    Run(String),
    List,
    Save(String),
    Load(String),
}

/// Parse a line of REPL input. Whitespace-trimmed; case-insensitive verbs.
pub fn parse_line(line: &str) -> ReplCommand {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return ReplCommand::Unknown(String::new());
    }
    let mut parts = trimmed.split_whitespace();
    let verb = parts.next().unwrap_or("").to_ascii_lowercase();
    let arg = parts.next().unwrap_or("").to_string();
    let arg2 = parts.next().unwrap_or("").to_string();

    match verb.as_str() {
        "help" | "?" => ReplCommand::Help,
        "identify" | "id" => ReplCommand::Identify,
        "jedec" => ReplCommand::Jedec,
        "status" | "sr" => ReplCommand::Status,
        "read" => ReplCommand::Read { path: arg },
        "write" => ReplCommand::Write { path: arg },
        "erase" => ReplCommand::Erase,
        "sector-erase" => {
            let address = parse_addr(&arg).unwrap_or(0);
            ReplCommand::SectorErase { address }
        }
        "reset" => ReplCommand::Reset,
        "quit" | "exit" | "q" => ReplCommand::Quit,
        "macro" => match arg.to_ascii_lowercase().as_str() {
            "start" => ReplCommand::Macro {
                sub: MacroSub::Start(arg2),
            },
            "stop" => ReplCommand::Macro {
                sub: MacroSub::Stop,
            },
            "run" => ReplCommand::Macro {
                sub: MacroSub::Run(arg2),
            },
            "list" => ReplCommand::Macro {
                sub: MacroSub::List,
            },
            "save" => ReplCommand::Macro {
                sub: MacroSub::Save(arg2),
            },
            "load" => ReplCommand::Macro {
                sub: MacroSub::Load(arg2),
            },
            _ => ReplCommand::Unknown(trimmed.to_string()),
        },
        "plugin" => ReplCommand::Plugin { path: arg },
        _ => ReplCommand::Unknown(trimmed.to_string()),
    }
}

fn parse_addr(s: &str) -> Option<u32> {
    let s = s.trim();
    if let Some(hex) = s.strip_prefix("0x").or_else(|| s.strip_prefix("0X")) {
        u32::from_str_radix(hex, 16).ok()
    } else {
        s.parse::<u32>().ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_identify_aliases() {
        assert_eq!(parse_line("identify"), ReplCommand::Identify);
        assert_eq!(parse_line("ID"), ReplCommand::Identify);
        assert_eq!(parse_line("  id  "), ReplCommand::Identify);
    }

    #[test]
    fn parse_help_aliases() {
        assert_eq!(parse_line("help"), ReplCommand::Help);
        assert_eq!(parse_line("?"), ReplCommand::Help);
    }

    #[test]
    fn parse_quit_aliases() {
        assert_eq!(parse_line("quit"), ReplCommand::Quit);
        assert_eq!(parse_line("exit"), ReplCommand::Quit);
        assert_eq!(parse_line("q"), ReplCommand::Quit);
    }

    #[test]
    fn parse_read_with_path() {
        assert_eq!(
            parse_line("read /tmp/out.bin"),
            ReplCommand::Read {
                path: "/tmp/out.bin".to_string()
            }
        );
    }

    #[test]
    fn parse_sector_erase_hex_address() {
        assert_eq!(
            parse_line("sector-erase 0x1000"),
            ReplCommand::SectorErase { address: 0x1000 }
        );
        assert_eq!(
            parse_line("sector-erase 4096"),
            ReplCommand::SectorErase { address: 4096 }
        );
    }

    #[test]
    fn parse_macro_subcommands() {
        assert_eq!(
            parse_line("macro start my-macro"),
            ReplCommand::Macro {
                sub: MacroSub::Start("my-macro".to_string())
            }
        );
        assert_eq!(
            parse_line("macro stop"),
            ReplCommand::Macro {
                sub: MacroSub::Stop
            }
        );
        assert_eq!(
            parse_line("macro list"),
            ReplCommand::Macro {
                sub: MacroSub::List
            }
        );
    }

    #[test]
    fn parse_unknown_preserves_text() {
        match parse_line("xyzzy abc") {
            ReplCommand::Unknown(s) => assert_eq!(s, "xyzzy abc"),
            other => panic!("expected Unknown, got {other:?}"),
        }
    }

    #[test]
    fn parse_empty_line_is_unknown() {
        assert_eq!(parse_line(""), ReplCommand::Unknown(String::new()));
        assert_eq!(parse_line("   "), ReplCommand::Unknown(String::new()));
    }
}
