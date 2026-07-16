//! List every USB device libusb can see, so a "device not found" can be told
//! apart from a device that enumerated under an unexpected VID/PID.
//!
//! Run: cargo run -p ratchet-usb --example usb_list

use ratchet_usb::Context;

fn main() {
    let ctx = Context::new().expect("libusb init");
    let devs = ctx.devices().expect("enumerate");
    println!("{} device(s) on the bus:", devs.len());
    for d in &devs {
        let tag = match (d.vendor_id, d.product_id) {
            (0x1a86, 0x5512) => "  <-- CH341A",
            (0x1a86, 0x55db) | (0x1a86, 0x55dd) | (0x1a86, 0x55de) => "  <-- CH347",
            (0x1a86, _) => "  <-- WCH device (unexpected pid)",
            _ => "",
        };
        println!(
            "  vid={:#06x} pid={:#06x} class={:#04x} bcd={:#06x}{}",
            d.vendor_id, d.product_id, d.class, d.bcd_device, tag
        );
    }
}
