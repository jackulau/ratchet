// Custom libusb FFI bindings. Built at compile time by bindgen against system libusb.h.
// No third-party `rusb` or `nusb` crate  -  we own the binding layer.

use std::env;
use std::path::PathBuf;

fn main() {
    let libusb = pkg_config::Config::new()
        .atleast_version("1.0.16")
        .probe("libusb-1.0")
        .expect("libusb-1.0 not found via pkg-config. Install: `brew install libusb` (macOS) / `apt install libusb-1.0-0-dev` (Debian) / `pacman -S libusb` (Arch)");

    let mut builder = bindgen::Builder::default()
        .header("wrapper.h")
        .parse_callbacks(Box::new(bindgen::CargoCallbacks::new()))
        .allowlist_function("libusb_.*")
        .allowlist_type("libusb_.*")
        .allowlist_var("LIBUSB_.*")
        .prepend_enum_name(false)
        .derive_default(true)
        .derive_debug(true)
        // Layout tests are the FFI boundary's only ground-truth verification:
        // bindgen emits size/alignment assertions for every bound struct, so a
        // header drift or ABI mismatch fails `cargo test -p ratchet-usb-sys`
        // instead of corrupting memory at runtime.
        .layout_tests(true);

    for path in &libusb.include_paths {
        builder = builder.clang_arg(format!("-I{}", path.display()));
    }

    let bindings = builder
        .generate()
        .expect("bindgen failed to generate libusb bindings");

    let out_path = PathBuf::from(env::var("OUT_DIR").unwrap());
    bindings
        .write_to_file(out_path.join("libusb_bindings.rs"))
        .expect("failed to write bindings.rs");

    println!("cargo:rerun-if-changed=wrapper.h");
    println!("cargo:rerun-if-changed=build.rs");
}
