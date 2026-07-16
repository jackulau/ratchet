//! Measure CH341A bulk-transfer throughput without touching a flash chip.
//!
//! CS is never asserted, so an attached chip stays deselected and cannot be
//! read, erased, or programmed by this benchmark. Only the CH341A's own shift
//! engine and the USB round-trip cost are exercised.
//!
//! Run: cargo run -p ratchet-usb --example ch341a_bench

use ratchet_usb::Context;
use std::time::Instant;

const VID: u16 = 0x1a86;
const PID: u16 = 0x5512;
const EP_OUT: u8 = 0x02;
const EP_IN: u8 = 0x82;

const CMD_I2C_STREAM: u8 = 0xaa;
const CMD_UIO_STREAM: u8 = 0xab;
const CMD_SPI_STREAM: u8 = 0xa8;
const I2C_STM_SET: u8 = 0x60;
const I2C_STM_END: u8 = 0x00;
const UIO_STM_OUT: u8 = 0x80;
const UIO_STM_DIR: u8 = 0x40;
const UIO_STM_END: u8 = 0x20;

const PACKET: usize = 32; // 0xA8 + 31 data bytes
const PAYLOAD: usize = PACKET - 1;
const TIMEOUT: u32 = 1000;

fn main() {
    let ctx = Context::new().expect("libusb init");
    let h = match ctx.find_by_ids(VID, PID) {
        Ok(h) => h,
        Err(e) => {
            eprintln!("no CH341A: {e}");
            std::process::exit(1);
        }
    };
    h.claim_interface(0).expect("claim interface 0");

    // Same init as flashrom ch341a_spi.c: config_stream(100K) then enable_pins(true).
    h.bulk_out(
        EP_OUT,
        &[CMD_I2C_STREAM, I2C_STM_SET | 0x01, I2C_STM_END],
        TIMEOUT,
    )
    .expect("config_stream");
    h.bulk_out(
        EP_OUT,
        &[
            CMD_UIO_STREAM,
            UIO_STM_OUT | 0x37,
            UIO_STM_DIR | 0x3f,
            UIO_STM_END,
        ],
        TIMEOUT,
    )
    .expect("enable_pins");

    let n = 256usize; // packets per trial
    let bytes = (n * PAYLOAD) as f64;

    // A: today's path. One OUT + one IN per 31-byte packet, strictly alternating.
    let pkt = {
        let mut p = vec![0u8; PACKET];
        p[0] = CMD_SPI_STREAM;
        p
    };
    let mut rx = [0u8; PAYLOAD];
    let t = Instant::now();
    for _ in 0..n {
        h.bulk_out(EP_OUT, &pkt, TIMEOUT).expect("out");
        h.bulk_in(EP_IN, &mut rx, TIMEOUT).expect("in");
    }
    let a = t.elapsed();
    println!(
        "A sync per-packet : {:>8.1} ms  {:>7.1} KiB/s  ({:.0} us/round-trip)",
        a.as_secs_f64() * 1e3,
        bytes / a.as_secs_f64() / 1024.0,
        a.as_secs_f64() * 1e6 / n as f64
    );

    // B: how many packets can one OUT carry before the device stops accepting it?
    // The device owes 31 reply bytes per 32-byte packet; once its IN FIFO backs up
    // it NAKs the OUT, and a synchronous caller blocked in that OUT can never drain
    // IN to unblock it. This sweep finds the deadlock threshold.
    for k in [1usize, 2, 3, 4, 6, 8, 16, 32] {
        let mut big = Vec::with_capacity(k * PACKET);
        for _ in 0..k {
            big.extend_from_slice(&pkt);
        }
        let t = Instant::now();
        let out = h.bulk_out(EP_OUT, &big, 300);
        let drained = if out.is_ok() {
            let mut d = 0usize;
            for _ in 0..k {
                match h.bulk_in(EP_IN, &mut rx, 300) {
                    Ok(g) => d += g,
                    Err(_) => break,
                }
            }
            d
        } else {
            0
        };
        let el = t.elapsed();
        match out {
            Ok(_) => println!(
                "B k={k:<3} OUT ok  drained {drained:>4}/{:<4} bytes  {:>7.1} ms  {:>7.1} KiB/s",
                k * PAYLOAD,
                el.as_secs_f64() * 1e3,
                (k * PAYLOAD) as f64 / el.as_secs_f64() / 1024.0
            ),
            Err(e) => println!(
                "B k={k:<3} OUT FAILED ({e}) after {:.1} ms  <-- deadlock threshold",
                el.as_secs_f64() * 1e3
            ),
        }
        // Resync: drain whatever the device still owes before the next trial.
        while h.bulk_in(EP_IN, &mut rx, 60).unwrap_or(0) > 0 {}
    }
    // D: overlap OUT with a ring of parallel INs (flashrom's design).
    for ring in [4usize, 8, 16, 32, 64] {
        let mut big = Vec::with_capacity(n * PACKET);
        for _ in 0..n {
            big.extend_from_slice(&pkt);
        }
        let mut inbuf = vec![0u8; n * PAYLOAD];
        let t = Instant::now();
        let r = h.bulk_out_in_parallel(EP_OUT, &big, EP_IN, &mut inbuf, PAYLOAD, ring, TIMEOUT);
        let d = t.elapsed();
        match r {
            Ok(()) => println!(
                "D async ring={ring:<3}: {:>8.1} ms  {:>7.1} KiB/s  ({:.2}x vs A)",
                d.as_secs_f64() * 1e3,
                bytes / d.as_secs_f64() / 1024.0,
                a.as_secs_f64() / d.as_secs_f64()
            ),
            Err(e) => println!(
                "D async ring={ring:<3}: FAILED ({e}) after {:.1} ms",
                d.as_secs_f64() * 1e3
            ),
        }
        while h.bulk_in(EP_IN, &mut rx, 60).unwrap_or(0) > 0 {}
    }

    // E: scale up. A real 64 KB chunk is ~2100 packets; confirm the ring holds.
    let big_n = 2100usize;
    let mut big = Vec::with_capacity(big_n * PACKET);
    for _ in 0..big_n {
        big.extend_from_slice(&pkt);
    }
    let mut inbuf = vec![0u8; big_n * PAYLOAD];
    let t = Instant::now();
    let r = h.bulk_out_in_parallel(EP_OUT, &big, EP_IN, &mut inbuf, PAYLOAD, 32, TIMEOUT);
    let d = t.elapsed();
    match r {
        Ok(()) => println!(
            "\nE async 64KB-equiv ({} pkts, ring=32): {:.1} ms  {:.1} KiB/s  -> 32 MB in {:.1} min",
            big_n,
            d.as_secs_f64() * 1e3,
            (big_n * PAYLOAD) as f64 / d.as_secs_f64() / 1024.0,
            (33_554_432.0 / ((big_n * PAYLOAD) as f64 / d.as_secs_f64())) / 60.0
        ),
        Err(e) => println!("\nE async 64KB-equiv: FAILED ({e})"),
    }
    while h.bulk_in(EP_IN, &mut rx, 60).unwrap_or(0) > 0 {}

    h.bulk_out(
        EP_OUT,
        &[CMD_UIO_STREAM, UIO_STM_OUT | 0x37, UIO_STM_DIR, UIO_STM_END],
        TIMEOUT,
    )
    .ok();
    h.release_interface(0).ok();
}
