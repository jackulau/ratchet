## What and why

<!-- What this changes and the problem it solves. Link the issue if there is one. -->

## How it was tested

<!-- Commands you ran. If it touches a hardware path, say whether it ran against real silicon or only the mock / loopback bus, and on which programmer and chip. -->

## Checklist

- [ ] `cargo fmt --all --check`, `cargo clippy --workspace --all-targets --all-features -- -D warnings`, and `cargo test --workspace --all-features` pass (run from `rust/`)
- [ ] `bash tasks/cli-smoke.sh` and `bash tasks/mcp-smoke.sh` pass
- [ ] New behavior has a test
- [ ] A command without a live transport still exits non-zero with a clear message (no fake success)
- [ ] README and docs match the new behavior
