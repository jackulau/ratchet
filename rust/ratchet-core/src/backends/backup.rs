// Pre-write backup storage.
//
// Backups are the brick-recovery path: write_chip dumps the current chip
// contents before overwriting anything. They used to go to
// std::env::temp_dir(), which is wiped on reboot (exactly when a botched
// BIOS flash makes you reboot) and world-readable (BIOS dumps can carry
// NVRAM secrets: supervisor passwords, MACs, serials). They now live in a
// persistent per-user data dir with owner-only permissions.

use std::io;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

/// Resolve (and create, with owner-only 0700 permissions) the persistent
/// per-user backups directory.
///
/// Resolution order: `RATCHET_BACKUP_DIR` env override, `XDG_DATA_HOME`,
/// `~/.local/share/ratchet/backups`. Only when no home directory exists at
/// all does it fall back to a temp subdirectory — a degraded backup location
/// beats failing the backup entirely.
pub fn backup_dir() -> io::Result<PathBuf> {
    let base = if let Some(d) = std::env::var_os("RATCHET_BACKUP_DIR") {
        PathBuf::from(d)
    } else if let Some(d) = std::env::var_os("XDG_DATA_HOME").filter(|d| !d.is_empty()) {
        PathBuf::from(d).join("ratchet").join("backups")
    } else if let Some(home) = std::env::var_os("HOME").filter(|h| !h.is_empty()) {
        PathBuf::from(home)
            .join(".local")
            .join("share")
            .join("ratchet")
            .join("backups")
    } else {
        std::env::temp_dir().join("ratchet-backups")
    };
    std::fs::create_dir_all(&base)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&base, std::fs::Permissions::from_mode(0o700))?;
    }
    Ok(base)
}

/// Create a fresh, empty, owner-only (0600) timestamped backup file inside
/// [`backup_dir`] and return its path. The caller then writes the chip dump
/// into it; `std::fs::write` truncates in place, preserving the permissions
/// set here.
pub fn create_private_backup_path(prefix: &str) -> io::Result<PathBuf> {
    let dir = backup_dir()?;
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let path = dir.join(format!("{prefix}-{ts}.bin"));
    let mut opts = std::fs::OpenOptions::new();
    opts.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        opts.mode(0o600);
    }
    opts.open(&path)?;
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Serializes env-mutating tests (same hazard as the factory's ENV_GUARD).
    static ENV_GUARD: std::sync::Mutex<()> = std::sync::Mutex::new(());

    #[test]
    fn backup_dir_is_persistent_and_private() {
        let _guard = ENV_GUARD.lock().unwrap_or_else(|p| p.into_inner());

        // Default resolution (no override): must NOT land in the reboot-wiped
        // temp dir while a home directory exists.
        let prev = std::env::var_os("RATCHET_BACKUP_DIR");
        std::env::remove_var("RATCHET_BACKUP_DIR");
        if std::env::var_os("HOME").is_some() {
            let d = backup_dir().unwrap();
            assert!(
                !d.starts_with(std::env::temp_dir()),
                "default backup dir must be persistent, got {}",
                d.display()
            );
        }

        // Permission contract, checked against an isolated override dir.
        let sandbox = std::env::temp_dir().join(format!(
            "ratchet-backup-test-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::env::set_var("RATCHET_BACKUP_DIR", &sandbox);
        let file = create_private_backup_path("ratchet-backup").unwrap();
        assert!(file.exists());
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let dir_mode = std::fs::metadata(&sandbox).unwrap().permissions().mode() & 0o777;
            let file_mode = std::fs::metadata(&file).unwrap().permissions().mode() & 0o777;
            assert_eq!(dir_mode, 0o700, "backup dir must be owner-only");
            assert_eq!(file_mode, 0o600, "backup file must be owner-only");
        }

        std::fs::remove_dir_all(&sandbox).ok();
        match prev {
            Some(v) => std::env::set_var("RATCHET_BACKUP_DIR", v),
            None => std::env::remove_var("RATCHET_BACKUP_DIR"),
        }
    }
}
