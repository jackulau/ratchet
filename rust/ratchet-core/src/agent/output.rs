// Tty-aware output helpers  -  color and formatting for human-readable mode.
// Ports src/output.ts. Pure-functions return styled strings; printing is the
// caller's responsibility, which keeps these testable.

const RESET: &str = "\x1b[0m";
const BOLD: &str = "\x1b[1m";
const DIM: &str = "\x1b[2m";
const RED: &str = "\x1b[31m";
const GREEN: &str = "\x1b[32m";
const YELLOW: &str = "\x1b[33m";
const CYAN: &str = "\x1b[36m";

/// Wrap `text` in ANSI escapes only when `tty` is true.
pub fn colorize(tty: bool, color_code: &str, text: &str) -> String {
    if tty {
        format!("{color_code}{text}{RESET}")
    } else {
        text.to_string()
    }
}

pub fn ok_line(tty: bool, msg: &str) -> String {
    format!("{} {msg}", colorize(tty, GREEN, "  ✓"))
}

pub fn fail_line(tty: bool, msg: &str) -> String {
    format!("{} {msg}", colorize(tty, RED, "  ✗"))
}

pub fn warn_line(tty: bool, msg: &str) -> String {
    format!("{} {msg}", colorize(tty, YELLOW, "  ⚠"))
}

pub fn info_line(tty: bool, msg: &str) -> String {
    format!("{} {msg}", colorize(tty, CYAN, "  →"))
}

pub fn header_line(tty: bool, msg: &str) -> String {
    format!("\n{}", colorize(tty, BOLD, msg))
}

pub fn dim_line(tty: bool, msg: &str) -> String {
    colorize(tty, DIM, &format!("    {msg}"))
}

pub fn kv_line(tty: bool, key: &str, value: &str) -> String {
    let padded = format!("{:<16}", format!("{key}:"));
    format!("    {} {value}", colorize(tty, DIM, &padded))
}

/// Render a table whose first row is the header. Each row gets column-aligned.
/// Returns one string with embedded newlines.
pub fn table(tty: bool, rows: &[Vec<String>]) -> String {
    if rows.is_empty() {
        return String::new();
    }
    let cols = rows[0].len();
    let mut widths: Vec<usize> = vec![0; cols];
    for row in rows {
        for (i, cell) in row.iter().enumerate() {
            if i < cols && cell.len() > widths[i] {
                widths[i] = cell.len();
            }
        }
    }
    let mut out = String::new();
    for (r, row) in rows.iter().enumerate() {
        let cells: Vec<String> = (0..cols)
            .map(|i| {
                let cell = row.get(i).map(String::as_str).unwrap_or("");
                format!("{:<width$}", cell, width = widths[i])
            })
            .collect();
        let line = format!("    {}", cells.join("  "));
        if r == 0 {
            out.push_str(&colorize(tty, BOLD, &line));
            out.push('\n');
            let sep: String = widths
                .iter()
                .map(|w| "─".repeat(*w))
                .collect::<Vec<_>>()
                .join("  ");
            out.push_str(&format!("    {sep}\n"));
        } else {
            out.push_str(&line);
            out.push('\n');
        }
    }
    out
}

pub fn progress_bar(percent: u32, width: u32) -> String {
    let pct = percent.min(100);
    let filled = ((pct as f64 / 100.0) * width as f64).round() as usize;
    let empty = (width as usize).saturating_sub(filled);
    format!("[{}{}] {pct}%", "█".repeat(filled), "░".repeat(empty))
}

pub fn format_duration(ms: u64) -> String {
    if ms < 1000 {
        format!("{ms}ms")
    } else if ms < 60_000 {
        format!("{:.1}s", ms as f64 / 1000.0)
    } else {
        let min = ms / 60_000;
        let sec = (ms % 60_000) / 1000;
        format!("{min}m {sec}s")
    }
}

pub fn format_bytes(bytes: u64) -> String {
    if bytes < 1024 {
        format!("{bytes} B")
    } else if bytes < 1024 * 1024 {
        format!("{:.1} KB", bytes as f64 / 1024.0)
    } else {
        format!("{:.1} MB", bytes as f64 / (1024.0 * 1024.0))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn colorize_off_returns_bare_text() {
        assert_eq!(colorize(false, RED, "hello"), "hello");
    }

    #[test]
    fn colorize_on_wraps_in_escapes() {
        let s = colorize(true, GREEN, "ok");
        assert!(s.starts_with(GREEN));
        assert!(s.ends_with(RESET));
        assert!(s.contains("ok"));
    }

    #[test]
    fn ok_line_starts_with_checkmark() {
        let s = ok_line(false, "done");
        assert!(s.contains("✓"));
        assert!(s.contains("done"));
    }

    #[test]
    fn kv_line_pads_key_to_16_chars() {
        let s = kv_line(false, "size", "8 MB");
        assert!(s.contains("size:"));
        assert!(s.contains("8 MB"));
        // Padding produces consistent column layout: 16-char key field.
        assert!(s.contains("size:           "));
    }

    #[test]
    fn table_renders_header_and_rows() {
        let rows: Vec<Vec<String>> = vec![
            vec!["chip".into(), "size".into()],
            vec!["W25Q64".into(), "8 MB".into()],
            vec!["MX25L256".into(), "32 MB".into()],
        ];
        let s = table(false, &rows);
        assert!(s.contains("chip"));
        assert!(s.contains("W25Q64"));
        assert!(s.contains("MX25L256"));
        // Separator characters appear after header.
        assert!(s.contains("─"));
    }

    #[test]
    fn progress_bar_zero_and_full() {
        let zero = progress_bar(0, 10);
        assert_eq!(zero.matches('░').count(), 10);
        assert_eq!(zero.matches('█').count(), 0);
        let full = progress_bar(100, 10);
        assert_eq!(full.matches('█').count(), 10);
        assert_eq!(full.matches('░').count(), 0);
    }

    #[test]
    fn progress_bar_clamps_over_100() {
        let s = progress_bar(150, 10);
        assert!(s.contains("100%"));
    }

    #[test]
    fn format_duration_buckets() {
        assert_eq!(format_duration(500), "500ms");
        assert_eq!(format_duration(1_500), "1.5s");
        assert_eq!(format_duration(75_000), "1m 15s");
    }

    #[test]
    fn format_bytes_buckets() {
        assert_eq!(format_bytes(512), "512 B");
        assert_eq!(format_bytes(4096), "4.0 KB");
        assert_eq!(format_bytes(8 * 1024 * 1024), "8.0 MB");
    }

    #[test]
    fn header_starts_with_newline() {
        let s = header_line(false, "Section");
        assert!(s.starts_with("\n"));
        assert!(s.contains("Section"));
    }
}
