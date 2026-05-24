// Stable JSON envelope for `--json` mode (CLI + MCP server).
// Shape must remain backward-compatible — agents depend on these field names.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AgentError {
    pub code: String,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hint: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AgentEnvelope<T = serde_json::Value>
where
    T: Serialize,
{
    pub ok: bool,
    pub command: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub data: Option<T>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<AgentError>,
    #[serde(
        rename = "nextAction",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub next_action: Option<String>,
}

impl<T: Serialize> AgentEnvelope<T> {
    pub fn ok(command: impl Into<String>, data: T) -> Self {
        Self {
            ok: true,
            command: command.into(),
            data: Some(data),
            error: None,
            next_action: None,
        }
    }

    pub fn ok_with_next(
        command: impl Into<String>,
        data: T,
        next_action: impl Into<String>,
    ) -> Self {
        Self {
            ok: true,
            command: command.into(),
            data: Some(data),
            error: None,
            next_action: Some(next_action.into()),
        }
    }
}

impl AgentEnvelope<serde_json::Value> {
    pub fn fail(
        command: impl Into<String>,
        code: impl Into<String>,
        message: impl Into<String>,
    ) -> Self {
        Self {
            ok: false,
            command: command.into(),
            data: None,
            error: Some(AgentError {
                code: code.into(),
                message: message.into(),
                hint: None,
            }),
            next_action: None,
        }
    }

    pub fn fail_with_hint(
        command: impl Into<String>,
        code: impl Into<String>,
        message: impl Into<String>,
        hint: impl Into<String>,
    ) -> Self {
        let mut env = Self::fail(command, code, message);
        if let Some(e) = env.error.as_mut() {
            e.hint = Some(hint.into());
        }
        env
    }
}

/// Returns true if `--json` flag is present in the argument vector.
pub fn wants_json(args: &[String]) -> bool {
    args.iter().any(|a| a == "--json")
}

/// Returns true if `--ndjson` flag is present.
pub fn wants_ndjson(args: &[String]) -> bool {
    args.iter().any(|a| a == "--ndjson")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn ok_envelope_serializes_minimal_shape() {
        let env = AgentEnvelope::ok("detect", json!({"chip": "W25Q64"}));
        let s = serde_json::to_string(&env).unwrap();
        assert!(s.contains("\"ok\":true"));
        assert!(s.contains("\"command\":\"detect\""));
        assert!(s.contains("\"chip\":\"W25Q64\""));
        // No error / nextAction emitted by default.
        assert!(!s.contains("error"));
        assert!(!s.contains("nextAction"));
    }

    #[test]
    fn fail_envelope_includes_error_code_and_message() {
        let env = AgentEnvelope::fail("read", "io_error", "USB disconnected");
        let s = serde_json::to_string(&env).unwrap();
        assert!(s.contains("\"ok\":false"));
        assert!(s.contains("\"code\":\"io_error\""));
        assert!(s.contains("\"message\":\"USB disconnected\""));
        assert!(!s.contains("hint"));
    }

    #[test]
    fn fail_with_hint_includes_hint_field() {
        let env =
            AgentEnvelope::fail_with_hint("read", "no_chip", "no JEDEC ID", "reseat the clip");
        let s = serde_json::to_string(&env).unwrap();
        assert!(s.contains("\"hint\":\"reseat the clip\""));
    }

    #[test]
    fn ok_with_next_action_emits_camelcase_key() {
        let env = AgentEnvelope::ok_with_next("write", json!({}), "verify");
        let s = serde_json::to_string(&env).unwrap();
        assert!(s.contains("\"nextAction\":\"verify\""));
    }

    #[test]
    fn ok_envelope_roundtrips_through_json() {
        let env = AgentEnvelope::ok("detect", json!({"chip": "W25Q64"}));
        let s = serde_json::to_string(&env).unwrap();
        let back: AgentEnvelope = serde_json::from_str(&s).unwrap();
        assert!(back.ok);
        assert_eq!(back.command, "detect");
    }

    #[test]
    fn wants_json_detection() {
        let args = vec!["read".to_string(), "--json".to_string()];
        assert!(wants_json(&args));
        let args = vec!["read".to_string()];
        assert!(!wants_json(&args));
    }

    #[test]
    fn wants_ndjson_detection() {
        let args = vec!["read".to_string(), "--ndjson".to_string()];
        assert!(wants_ndjson(&args));
        let args = vec!["read".to_string(), "--json".to_string()];
        assert!(!wants_ndjson(&args));
    }
}
