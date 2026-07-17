// CH341A SPI backend  -  ports src/backends/ch341a.ts.
//
// Architecture: protocol-level functions (packet builders / parsers) are pure
// and heavily tested without USB. The backend struct wires them to a `UsbBus`
// trait, which real hardware satisfies via ratchet_usb::DeviceHandle. Tests use
// an in-memory recorder to assert protocol correctness without hardware.

use super::{reject_blank_image, Backend, BackendError, Result, WriteOpts};
use crate::chips::{format_size, lookup_by_jedec_id, needs_4byte_addressing};
use crate::types::*;
use sha2::{Digest, Sha256};
use std::path::Path;
use std::time::{Duration, Instant};

// USB device IDs ─────────────────────────────────────────────────────────────
pub const CH341A_VID: u16 = 0x1a86;
pub const CH341A_PID: u16 = 0x5512;
pub const CH341B_PID: u16 = 0x5523;
pub const QINHENG_VID_ALT: u16 = 0x4348;

// CH341A USB endpoints ───────────────────────────────────────────────────────
pub const USB_EP_OUT: u8 = 0x02;
pub const USB_EP_IN: u8 = 0x82;
pub const PACKET_LENGTH: usize = 0x20;
pub const MAX_XFER: usize = 32;

// CH341A USB command opcodes ─────────────────────────────────────────────────
pub const CMD_SPI_STREAM: u8 = 0xa8;
pub const CMD_UIO_STREAM: u8 = 0xab;

pub const UIO_STM_IN: u8 = 0x00;
pub const UIO_STM_DIR: u8 = 0x40;
pub const UIO_STM_OUT: u8 = 0x80;
pub const UIO_STM_END: u8 = 0x20;

pub const STM_SPI_CS: u8 = 0x01;
/// Direction mask making D0-D5 outputs: CS0/CS1/CS2, SCK (D3), DOUT2 (D4),
/// MOSI (D5). D6/D7 stay inputs (D7 is MISO). This is the mask every working
/// reference implementation programs (flashrom ch341a_spi.c and ch341prog use
/// 0x3F); anything narrower leaves SCK/MOSI hi-Z and the chip never hears a
/// command — the bus then reads all-zero with perfect physical contact.
pub const STM_SPI_DIR_OUTPUTS: u8 = 0x3f;

// SPI flash command bytes ────────────────────────────────────────────────────
pub const SPI_RDID: u8 = 0x9f;
pub const SPI_READ: u8 = 0x03;
pub const SPI_FAST_READ: u8 = 0x0b;
pub const SPI_WREN: u8 = 0x06;
pub const SPI_WRDI: u8 = 0x04;
pub const SPI_PAGE_PROGRAM: u8 = 0x02;
pub const SPI_SECTOR_ERASE: u8 = 0x20;
pub const SPI_BLOCK_ERASE_32K: u8 = 0x52;
pub const SPI_BLOCK_ERASE: u8 = 0xd8;
pub const SPI_CHIP_ERASE: u8 = 0xc7;
pub const SPI_RDSR: u8 = 0x05;
pub const SPI_RDSR2: u8 = 0x35;
pub const SPI_RDSR3: u8 = 0x15;
pub const SPI_WRSR: u8 = 0x01;
pub const SPI_EWSR: u8 = 0x50;
pub const SPI_SFDP: u8 = 0x5a;
pub const SPI_EN4B: u8 = 0xb7;
pub const SPI_EX4B: u8 = 0xe9;
pub const SPI_READ_4B: u8 = 0x13;
pub const SPI_PAGE_PROGRAM_4B: u8 = 0x12;
pub const SPI_SECTOR_ERASE_4B: u8 = 0x21;
pub const SPI_BLOCK_ERASE_4B: u8 = 0xdc;
pub const SPI_RESET_ENABLE: u8 = 0x66;
pub const SPI_RESET: u8 = 0x99;

// Status register bits
pub const SR_WIP: u8 = 0x01;
pub const SR_WEL: u8 = 0x02;
/// Block-protect bits BP0-BP2: any set means part of the array is write-protected.
pub const SR_BP_MASK: u8 = 0x1c;

// Timeouts
pub const USB_TIMEOUT: Duration = Duration::from_millis(5000);
pub const PAGE_PROGRAM_TIMEOUT: Duration = Duration::from_millis(10000);
pub const ERASE_TIMEOUT: Duration = Duration::from_millis(120000);

/// Chip-erase duration scales with capacity: ~100 s worst-case for an 8 MB part
/// but 200-400 s for 16-32 MB parts (vendor datasheets). A fixed 120 s timeout
/// declares a healthy 32 MB chip dead mid-erase. Floor of 120 s, ~13 s per MB
/// above that (32 MB → 416 s, comfortably past the worst datasheet maximum).
pub fn erase_timeout_for(size_bytes: u64) -> Duration {
    let mb = size_bytes / (1024 * 1024);
    Duration::from_secs((mb * 13).max(120))
}

pub const SIZE_16MB: u64 = 16 * 1024 * 1024;

/// Bytes per SPI read transaction. Each chunk is independently addressed and
/// retryable, so this is the blast radius of one contact dropout. Big enough to
/// amortise USB latency across the IN ring (a 64 KB chunk is ~2100 packets),
/// small enough that a retry is cheap and progress stays responsive.
pub const READ_CHUNK: usize = 64 * 1024;

/// Attempts per chunk before a read gives up and fails closed.
pub const READ_CHUNK_ATTEMPTS: u32 = 3;

/// Erase granularity used by write_chip (matches SPI_BLOCK_ERASE / _4B).
pub const BLOCK_64K: u64 = 64 * 1024;

/// Attempts per block before a write gives up. A block is erased, programmed and
/// read back as one unit, so a retry re-does the whole unit and cannot leave the
/// block half-erased.
pub const WRITE_BLOCK_ATTEMPTS: u32 = 3;

// ─── Pure protocol functions (no I/O) ───────────────────────────────────────

/// Build the SPI-mode-enable UIO packet sent right after claiming the interface.
/// OUT first (CS0 high = deasserted, SCK/MOSI low = mode-0 idle), then DIR
/// 0x3F so CS, SCK and MOSI are actually driven — see STM_SPI_DIR_OUTPUTS.
pub fn enable_spi_mode_packet() -> [u8; 4] {
    [
        CMD_UIO_STREAM,
        UIO_STM_OUT | STM_SPI_CS,
        UIO_STM_DIR | STM_SPI_DIR_OUTPUTS,
        UIO_STM_END,
    ]
}

/// CS-low (assert) UIO packet.
pub fn cs_assert_packet() -> [u8; 3] {
    [CMD_UIO_STREAM, UIO_STM_OUT, UIO_STM_END]
}

/// CS-high (deassert) UIO packet.
pub fn cs_deassert_packet() -> [u8; 3] {
    [CMD_UIO_STREAM, UIO_STM_OUT | STM_SPI_CS, UIO_STM_END]
}

/// Encode an SPI flash address. 3-byte mode for chips ≤16MB; 4-byte for larger.
pub fn address_bytes(addr: u64, use_4byte: bool) -> Vec<u8> {
    if use_4byte {
        vec![
            ((addr >> 24) & 0xff) as u8,
            ((addr >> 16) & 0xff) as u8,
            ((addr >> 8) & 0xff) as u8,
            (addr & 0xff) as u8,
        ]
    } else {
        vec![
            ((addr >> 16) & 0xff) as u8,
            ((addr >> 8) & 0xff) as u8,
            (addr & 0xff) as u8,
        ]
    }
}

/// Reverse the bit order of every byte in place.
///
/// The CH341A's SPI stream engine (CMD_SPI_STREAM, 0xA8) shifts data **LSB
/// first** — there is no hardware config to change it. SPI flash chips expect
/// MSB first, so every payload byte must be bit-reversed on the way out AND
/// every received byte bit-reversed on the way in (flashrom's ch341a_spi.c
/// does exactly this). Without it the chip hears 0x9F as 0xF9, ignores the
/// command, and every read comes back 0x00 — indistinguishable from a dead
/// bus. UIO packets (CS control, mode setup) are NOT SPI data and must never
/// be reversed.
pub fn reverse_bits_in_place(buf: &mut [u8]) {
    for b in buf {
        *b = b.reverse_bits();
    }
}

/// Chunk an SPI tx stream into CH341A USB packets.
/// Each packet starts with CMD_SPI_STREAM and carries up to 31 SPI data bytes,
/// bit-reversed for the CH341A's LSB-first shifter (see reverse_bits_in_place).
pub fn spi_stream_chunks(tx: &[u8]) -> Vec<Vec<u8>> {
    let max_payload = MAX_XFER - 1; // 31 SPI bytes per USB packet
    let mut out = Vec::new();
    let mut offset = 0;
    while offset < tx.len() {
        let chunk_len = (tx.len() - offset).min(max_payload);
        let mut packet = Vec::with_capacity(chunk_len + 1);
        packet.push(CMD_SPI_STREAM);
        packet.extend_from_slice(&tx[offset..offset + chunk_len]);
        reverse_bits_in_place(&mut packet[1..]);
        out.push(packet);
        offset += chunk_len;
    }
    out
}

/// Pack an SPI tx stream into one contiguous run of CH341A USB packets: each is
/// CMD_SPI_STREAM followed by up to 31 bit-reversed data bytes (LSB-first
/// shifter, see reverse_bits_in_place).
///
/// Only the final packet may be short. That matters: the device replies with one
/// 31-byte packet per full command packet, and a short USB packet terminates a
/// bulk transfer, so uniform framing is what lets an IN ring size its transfers
/// without knowing the payload. Same layout as flashrom's ch341a_spi.c.
pub fn pack_spi_stream(tx: &[u8]) -> Vec<u8> {
    let max_payload = MAX_XFER - 1; // 31 SPI bytes per USB packet
    let mut out = Vec::with_capacity(tx.len() + tx.len().div_ceil(max_payload));
    for chunk in tx.chunks(max_payload) {
        out.push(CMD_SPI_STREAM);
        let start = out.len();
        out.extend_from_slice(chunk);
        reverse_bits_in_place(&mut out[start..]);
    }
    out
}

/// Decode a 4-byte RDID response (cmd echo + 3 ID bytes).
pub fn decode_jedec_response(rx: &[u8]) -> Option<JedecId> {
    if rx.len() < 4 {
        return None;
    }
    Some(JedecId {
        manufacturer: rx[1],
        memory_type: rx[2],
        capacity: rx[3],
    })
}

// ─── UsbBus abstraction (for hardware injection and testing) ────────────────

/// Minimal USB transport surface the CH341A backend needs.
/// Real hardware wraps `ratchet_usb::DeviceHandle`; tests use a recorder.
pub trait UsbBus: Send {
    fn bulk_write(&mut self, data: &[u8]) -> Result<()>;
    fn bulk_read(&mut self, len: usize) -> Result<Vec<u8>>;

    /// Read exactly `buf.len()` bytes into a caller-provided buffer. Hot paths
    /// (read_range) call this once per 31-byte USB packet, so the live bus
    /// overrides it to fill the slice directly — the default wraps `bulk_read`
    /// for mocks/tests. Fails closed with `ShortTransfer` on a short read.
    fn bulk_read_into(&mut self, buf: &mut [u8]) -> Result<()> {
        let rx = self.bulk_read(buf.len())?;
        if rx.len() < buf.len() {
            return Err(BackendError::Usb(ratchet_usb::UsbError::ShortTransfer {
                expected: buf.len(),
                actual: rx.len(),
            }));
        }
        buf.copy_from_slice(&rx[..buf.len()]);
        Ok(())
    }

    /// Stream a run of pre-packed CH341A packets, draining the device's replies
    /// concurrently. `out` is contiguous packets of CMD_SPI_STREAM + up to
    /// `in_chunk` data bytes each (only the last may be short); the device
    /// answers one byte per data byte, so `in_buf.len()` is the total data count.
    ///
    /// The default alternates one packet at a time — identical to what a caller
    /// would have issued by hand, which is what mocks and unit tests observe.
    /// `LibusbBus` overrides it with an overlapped async ring: measured on real
    /// silicon, the CH341A accepts a batched OUT only up to ~4 packets and then
    /// NAKs, and a caller blocked inside that OUT can never drain IN to unblock
    /// it. Overlapping the directions is the only way to beat one round-trip per
    /// 31 bytes (~350 us, i.e. 84 KiB/s).
    fn bulk_stream(&mut self, out: &[u8], in_buf: &mut [u8], in_chunk: usize) -> Result<()> {
        let mut done = 0usize;
        for pkt in out.chunks(in_chunk + 1) {
            self.bulk_write(pkt)?;
            let n = (pkt.len() - 1).min(in_buf.len().saturating_sub(done));
            if n == 0 {
                break;
            }
            self.bulk_read_into(&mut in_buf[done..done + n])?;
            done += n;
        }
        Ok(())
    }
}

/// In-memory bus for tests. Captures every write and serves pre-queued reads.
pub struct MockBus {
    pub writes: Vec<Vec<u8>>,
    pub read_queue: std::collections::VecDeque<Vec<u8>>,
}

impl MockBus {
    pub fn new() -> Self {
        Self {
            writes: Vec::new(),
            read_queue: std::collections::VecDeque::new(),
        }
    }
    pub fn queue_read(&mut self, data: Vec<u8>) {
        self.read_queue.push_back(data);
    }
}

impl Default for MockBus {
    fn default() -> Self {
        Self::new()
    }
}

impl UsbBus for MockBus {
    fn bulk_write(&mut self, data: &[u8]) -> Result<()> {
        self.writes.push(data.to_vec());
        Ok(())
    }
    fn bulk_read(&mut self, len: usize) -> Result<Vec<u8>> {
        let data = self
            .read_queue
            .pop_front()
            .ok_or_else(|| BackendError::Other("MockBus: read queue empty".into()))?;
        if data.len() < len {
            let mut padded = data;
            padded.resize(len, 0);
            Ok(padded)
        } else {
            Ok(data[..len].to_vec())
        }
    }
}

// ─── CH341A backend (generic over UsbBus) ───────────────────────────────────

pub struct CH341ABackend<B: UsbBus> {
    bus: Option<B>,
    use_4byte_addr: bool,
    progress: Option<super::ProgressFn>,
    /// JEDEC id observed at identify time. Long operations re-check against it to
    /// tell a dead bus apart from legitimately zero-filled flash.
    jedec_expect: Option<[u8; 3]>,
}

impl<B: UsbBus> CH341ABackend<B> {
    pub fn with_bus(bus: B) -> Self {
        Self {
            bus: Some(bus),
            use_4byte_addr: false,
            progress: None,
            jedec_expect: None,
        }
    }

    pub fn enable_spi_mode(&mut self) -> Result<()> {
        let bus = self.bus.as_mut().ok_or(BackendError::NotConnected)?;
        bus.bulk_write(&enable_spi_mode_packet())
    }

    /// Send an SPI command (CS↓ … data … CS↑), returning the rx bytes.
    pub fn spi_command(&mut self, cmd: &[u8]) -> Result<Vec<u8>> {
        let bus = self.bus.as_mut().ok_or(BackendError::NotConnected)?;
        bus.bulk_write(&cs_assert_packet())?;
        let res = Self::spi_command_chunks(bus, cmd);
        // CS must be released on success AND failure: a chip left selected after
        // a mid-stream USB error treats the next command's clocks as continuation
        // data. The original error takes precedence over a deassert failure.
        let deassert = bus.bulk_write(&cs_deassert_packet());
        let rx = res?;
        deassert?;
        Ok(rx)
    }

    fn spi_command_chunks(bus: &mut B, cmd: &[u8]) -> Result<Vec<u8>> {
        let mut rx = Vec::with_capacity(cmd.len());
        // Chunk inline with a single reused packet buffer: only the payload bytes
        // change per chunk, so we avoid building a fresh Vec<Vec<u8>> of sub-packets.
        let max_payload = MAX_XFER - 1; // 31 SPI bytes per USB packet
        let mut packet: Vec<u8> = Vec::with_capacity(max_payload + 1);
        let mut offset = 0;
        while offset < cmd.len() {
            let chunk_len = (cmd.len() - offset).min(max_payload);
            packet.clear();
            packet.push(CMD_SPI_STREAM);
            packet.extend_from_slice(&cmd[offset..offset + chunk_len]);
            // CH341A shifts LSB-first: payload out AND rx back must be
            // bit-reversed (see reverse_bits_in_place).
            reverse_bits_in_place(&mut packet[1..]);
            bus.bulk_write(&packet)?;
            let mut r = bus.bulk_read(chunk_len)?;
            reverse_bits_in_place(&mut r);
            rx.extend_from_slice(&r);
            offset += chunk_len;
        }
        Ok(rx)
    }

    pub fn rdid(&mut self) -> Result<JedecId> {
        let rx = self.spi_command(&[SPI_RDID, 0, 0, 0])?;
        decode_jedec_response(&rx).ok_or(BackendError::ChipNotDetected)
    }

    /// Read one status register, failing CLOSED on a short/garbled RDSR
    /// response. A flaky bus must never read as "ready" (WIP clear) or
    /// "unprotected" (BP clear): those optimistic defaults green-light
    /// destructive ops exactly when the transport is least trustworthy — and a
    /// short read snapshotted as 0x00 would make the post-repair WP restore
    /// re-apply "no protection" to a chip that was protected.
    fn read_status_strict(&mut self, opcode: u8) -> Result<u8> {
        self.spi_command(&[opcode, 0])?
            .get(1)
            .copied()
            .ok_or_else(|| {
                BackendError::Other(
                    "short RDSR response — status register unreadable; failing closed".into(),
                )
            })
    }

    fn read_sr1_strict(&mut self) -> Result<u8> {
        self.read_status_strict(SPI_RDSR)
    }

    /// Poll RDSR until the write-in-progress (WIP) bit clears, or `timeout` elapses.
    /// Every erase and page-program MUST be followed by this: SPI flash NAKs further
    /// commands while an internal write/erase is running, and chip-erase can take well
    /// over a minute on a 16MB part. Skipping it silently corrupts writes.
    pub fn wait_until_ready(&mut self, timeout: Duration) -> Result<()> {
        let start = Instant::now();
        let mut backoff = Duration::from_micros(50);
        loop {
            let sr1 = self.read_sr1_strict()?;
            if sr1 & SR_WIP == 0 {
                return Ok(());
            }
            if start.elapsed() >= timeout {
                return Err(BackendError::Other(format!(
                    "chip still busy (WIP set) after {} ms",
                    timeout.as_millis()
                )));
            }
            std::thread::sleep(backoff);
            backoff = (backoff * 2).min(Duration::from_millis(20));
        }
    }

    /// Read `len` bytes starting at `start_addr` via the READ (0x03) opcode.
    /// Shared by `read_chip` (whole chip) and `verify_chip` (file-length read-back) so the two
    /// always use identical addressing.
    ///
    /// The range is split into `READ_CHUNK`-sized SPI transactions, each a
    /// self-contained CS↓ / READ+address / data / CS↑. Per-chunk framing is what
    /// makes a dropout survivable: a wobbling probe costs one chunk retry instead
    /// of corrupting the whole dump, and each chunk's bytes are streamed through
    /// an overlapped IN ring rather than one round-trip per 31 bytes.
    pub fn read_range(&mut self, start_addr: u64, len: usize) -> Result<Vec<u8>> {
        if len == 0 {
            return Ok(Vec::new());
        }
        let mut buf = Vec::with_capacity(len);
        while buf.len() < len {
            let n = (len - buf.len()).min(READ_CHUNK);
            let addr = start_addr + buf.len() as u64;
            let chunk = self.read_chunk_checked(addr, n)?;
            buf.extend_from_slice(&chunk);
            if let Some(cb) = self.progress.as_mut() {
                cb(buf.len() as u64, len as u64);
            }
        }
        Ok(buf)
    }

    /// Read one chunk and confirm the chip was still there when it finished.
    ///
    /// Contact is not a fact established once at identify time; it decays. So the
    /// chunk's bytes are never the evidence -- the chip is. After every chunk, ask
    /// for the JEDEC id: the expected id back means the probe held for that chunk
    /// and the data is trustworthy whatever it contains; silence or a changed id
    /// means contact dropped and the chunk is garbage.
    ///
    /// Inspecting the DATA instead cannot work, and two real dropouts prove it. A
    /// probe that drops MID-chunk leaves real data followed by dropout bytes, so the
    /// chunk is not uniform and any "is it all 0x00?" test waves it through. A probe
    /// whose MISO floats high leaves 0xFF, which is byte-for-byte identical to erased
    /// flash (a lifted probe on this part reads ffffff). Both are silently-corrupt
    /// chunks under a data-inspection rule; neither survives asking the chip.
    ///
    /// Cost is one RDID per 64 KB: ~350 us per chunk, ~0.2 s over a 32 MB dump.
    /// That is the cheapest correctness in this file.
    fn read_chunk_checked(&mut self, addr: u64, n: usize) -> Result<Vec<u8>> {
        let expect = self.jedec_expect;
        let mut last: Option<String> = None;
        for attempt in 1..=READ_CHUNK_ATTEMPTS {
            let use_4byte = self.use_4byte_addr;
            let bus = self.bus.as_mut().ok_or(BackendError::NotConnected)?;
            match Self::read_one_chunk(bus, addr, n, use_4byte) {
                Ok(data) => match self.rdid() {
                    Ok(id) => {
                        let live = [id.manufacturer, id.memory_type, id.capacity];
                        if expect.is_none_or(|e| e == live) && live != [0, 0, 0] {
                            return Ok(data); // chip still answering: the chunk is real
                        }
                        last = Some(format!(
                            "chip id went {:02x}{:02x}{:02x} mid-read (expected {})",
                            live[0],
                            live[1],
                            live[2],
                            expect
                                .map(|e| format!("{:02x}{:02x}{:02x}", e[0], e[1], e[2]))
                                .unwrap_or_else(|| "a stable id".into())
                        ));
                    }
                    Err(e) => last = Some(format!("chip stopped answering ({e})")),
                },
                Err(e) => last = Some(e.to_string()),
            }
            if attempt < READ_CHUNK_ATTEMPTS {
                std::thread::sleep(Duration::from_millis(20));
            }
        }
        Err(BackendError::Other(format!(
            "lost contact with the chip at offset {addr:#x} and could not recover in \
             {READ_CHUNK_ATTEMPTS} attempts: {}. The probe is not holding — reseat it and \
             re-run. (Refusing to write a dead-bus read to disk: a dump padded with zeros \
             looks like a valid backup and is not.)",
            last.unwrap_or_else(|| "unknown".into())
        )))
    }

    /// One self-contained SPI read transaction, streamed as a single packed run.
    fn read_one_chunk(bus: &mut B, addr: u64, n: usize, use_4byte: bool) -> Result<Vec<u8>> {
        // Opcode + address are echoed back full-duplex and discarded. Packing them
        // into the same stream as the dummy bytes keeps every USB packet full, so
        // the device's replies stay a uniform 31 bytes for the IN ring to frame.
        let mut tx = Vec::with_capacity(5 + n);
        tx.push(SPI_READ);
        tx.extend(address_bytes(addr, use_4byte));
        let header_len = tx.len();
        tx.resize(header_len + n, 0);
        let stream = pack_spi_stream(&tx);
        let mut rx = vec![0u8; tx.len()];
        bus.bulk_write(&cs_assert_packet())?;
        let res = bus.bulk_stream(&stream, &mut rx, MAX_XFER - 1);
        // CS must be released on success AND failure (see spi_command); the
        // original error takes precedence over a deassert failure.
        let deassert = bus.bulk_write(&cs_deassert_packet());
        res?;
        deassert?;
        // Chip data arrives LSB-first from the CH341A shifter.
        reverse_bits_in_place(&mut rx);
        rx.drain(..header_len);
        Ok(rx)
    }

    /// Program a single page (≤ page_size bytes, never crossing a page boundary): WREN, then
    /// PAGE_PROGRAM with the address + data, then wait for WIP to clear before returning.
    pub fn page_program(&mut self, addr: u64, data: &[u8]) -> Result<()> {
        self.spi_command(&[SPI_WREN])?;
        let mut cmd = Vec::with_capacity(1 + 4 + data.len());
        cmd.push(if self.use_4byte_addr {
            SPI_PAGE_PROGRAM_4B
        } else {
            SPI_PAGE_PROGRAM
        });
        cmd.extend(address_bytes(addr, self.use_4byte_addr));
        cmd.extend_from_slice(data);
        self.spi_command(&cmd)?;
        self.wait_until_ready(PAGE_PROGRAM_TIMEOUT)
    }

    /// Put the chip into 4-byte address mode (EN4B, 0xb7) and remember it. Required for chips
    /// larger than 16 MB: without it a 4-byte address sent after a plain READ (0x03) is
    /// misinterpreted, so reads/writes land at the wrong offset. Sending EN4B is the most
    /// compatible activation — it works even on parts that lack the dedicated 4-byte opcodes.
    ///
    /// WREN precedes EN4B: Micron N25Q/MT25Q parts latch the address-mode change only when
    /// the write-enable latch is set and otherwise silently ignore B7h (then every 4-byte
    /// address reads one byte short — a wrong-offset dump). Winbond/Macronix accept B7h with
    /// or without WREN and ignore the dangling WEL (a subsequent READ does not consume it),
    /// so the extra command is safe across vendors.
    pub fn enter_4byte_mode(&mut self) -> Result<()> {
        self.spi_command(&[SPI_WREN])?;
        self.spi_command(&[SPI_EN4B])?;
        self.use_4byte_addr = true;
        Ok(())
    }

    /// Leave 4-byte address mode (EX4B, 0xe9) and clear the flag. Always paired with
    /// enter_4byte_mode at operation end: a chip left in 4-byte mode misaddresses for
    /// the next tool (or the motherboard itself) that assumes power-on 3-byte mode.
    /// WREN precedes EX4B for the same cross-vendor reason as enter_4byte_mode.
    pub fn exit_4byte_mode(&mut self) -> Result<()> {
        self.spi_command(&[SPI_WREN])?;
        self.spi_command(&[SPI_EX4B])?;
        self.use_4byte_addr = false;
        Ok(())
    }

    /// Best-effort EX4B after a top-level operation whose identify step may have
    /// entered 4-byte mode. The operation's own result takes precedence over a
    /// failure to restore addressing mode.
    fn exit_4byte_if_entered(&mut self) {
        if self.use_4byte_addr {
            let _ = self.exit_4byte_mode();
        }
    }

    /// SFDP read (0x5A): 3-byte SFDP-space address + one dummy byte, then `len`
    /// data bytes clocked out.
    fn sfdp_read_at(&mut self, addr: u32, len: usize) -> Result<Vec<u8>> {
        let mut cmd = vec![
            SPI_SFDP,
            (addr >> 16) as u8,
            (addr >> 8) as u8,
            addr as u8,
            0, // dummy cycle per JESD216
        ];
        let data_start = cmd.len();
        cmd.resize(data_start + len, 0);
        let rx = self.spi_command(&cmd)?;
        if rx.len() < data_start + len {
            return Err(BackendError::Other("short SFDP response".into()));
        }
        Ok(rx[data_start..data_start + len].to_vec())
    }

    /// SFDP fallback for a valid JEDEC id that is absent from the chip DB. The
    /// Basic Flash Parameter Table carries the chip's real density and erase
    /// geometry, so an unlisted-but-SFDP-compliant part becomes fully readable
    /// instead of failing later with size 0 (`read_chip_to_file` rejects a
    /// zero-size identity). Mirrors AsProgrammer/flashrom, which size an unknown
    /// chip from SFDP and read it anyway. Returns `None` when the chip exposes no
    /// usable SFDP table, leaving the honest size-0 "Unknown" identity in place
    /// rather than fabricating geometry.
    fn identify_via_sfdp(&mut self, hex: &str) -> Result<Option<ChipInfo>> {
        let Some(sfdp) = crate::sfdp::discover_sfdp(|addr, len| self.sfdp_read_at(addr, len))?
        else {
            return Ok(None);
        };
        if sfdp.density_bytes == 0 {
            return Ok(None);
        }
        Ok(Some(ChipInfo {
            name: format!("Unknown {} (via SFDP)", hex.to_ascii_uppercase()),
            vendor_name: "Unknown".into(),
            jedec_id: hex.to_string(),
            size_bytes: sfdp.density_bytes,
            size_human: format_size(sfdp.density_bytes),
            chip_type: "spi".into(),
            page_size: Some(sfdp.page_size),
            sector_size: Some(if sfdp.sector_size_4kb { 4096 } else { 65536 }),
            block_size: Some(if sfdp.block_size_64kb {
                65536
            } else if sfdp.block_size_32kb {
                32768
            } else {
                65536
            }),
            write_protected: None,
            voltage: None,
        }))
    }

    /// Refuse destructive ops on write-protected silicon: protected chips silently
    /// ignore erase/program commands, which would otherwise read as fake success.
    /// Reads SR1 strictly — a short response must not read as "unprotected".
    fn ensure_not_write_protected(&mut self) -> Result<()> {
        if self.read_sr1_strict()? & SR_BP_MASK != 0 {
            return Err(BackendError::WriteProtected);
        }
        Ok(())
    }

    /// Standalone erase verbs arrive without a prior identify, so a >16 MB chip
    /// would still be in power-on 3-byte mode and the erase address would silently
    /// wrap at 16 MB — destroying the wrong sector. Identify first (which enters
    /// 4-byte mode for big chips), then hard-refuse any range the active 3-byte
    /// framing cannot express. `end` is exclusive.
    fn prepare_erase_addressing(&mut self, end: u64) -> Result<()> {
        self.identify_chip()?;
        if !self.use_4byte_addr && end > SIZE_16MB {
            return Err(BackendError::Other(format!(
                "erase range ends at {end:#x} but the chip is in 3-byte address mode \
                 (16 MB limit); a 3-byte frame would silently wrap and erase the wrong sector"
            )));
        }
        Ok(())
    }

    /// Erase one 64 KB block without the write-protect pre-check. Same contract as
    /// sector_erase_inner: callers looping over a whole chip check protection once.
    fn block_erase_inner(&mut self, address: u64) -> Result<EraseResult> {
        let start = Instant::now();
        self.spi_command(&[SPI_WREN])?;
        let mut cmd = vec![if self.use_4byte_addr {
            SPI_BLOCK_ERASE_4B
        } else {
            SPI_BLOCK_ERASE
        }];
        cmd.extend(address_bytes(address, self.use_4byte_addr));
        self.spi_command(&cmd)?;
        self.wait_until_ready(ERASE_TIMEOUT)?;
        Ok(EraseResult {
            success: true,
            duration_ms: start.elapsed().as_millis() as u64,
            error: None,
        })
    }

    /// Erase one sector without the write-protect pre-check. Callers that loop over
    /// many sectors (write_chip, region_erase) check protection once up front.
    fn sector_erase_inner(&mut self, address: u64) -> Result<EraseResult> {
        let start = Instant::now();
        self.spi_command(&[SPI_WREN])?;
        let mut cmd = vec![if self.use_4byte_addr {
            SPI_SECTOR_ERASE_4B
        } else {
            SPI_SECTOR_ERASE
        }];
        cmd.extend(address_bytes(address, self.use_4byte_addr));
        self.spi_command(&cmd)?;
        self.wait_until_ready(ERASE_TIMEOUT)?;
        Ok(EraseResult {
            success: true,
            duration_ms: start.elapsed().as_millis() as u64,
            error: None,
        })
    }

    /// Whole-chip read without the trailing EX4B: write_chip's backup step runs this
    /// mid-operation while 4-byte mode must stay active.
    fn read_chip_to_file(&mut self, output_path: &Path) -> Result<ReadResult> {
        self.read_chip_to_file_buf(output_path).map(|(r, _)| r)
    }

    /// As `read_chip_to_file`, but also hands back the bytes it just read.
    /// `write_chip_inner` uses the mandatory backup read as its baseline for
    /// deciding which blocks already hold the target image, so the skip check
    /// costs no extra probe time.
    fn read_chip_to_file_buf(&mut self, output_path: &Path) -> Result<(ReadResult, Vec<u8>)> {
        let start = Instant::now();
        let chip = self.identify_chip()?.ok_or(BackendError::ChipNotDetected)?;
        let size = chip.size_bytes as usize;
        if size == 0 {
            return Err(BackendError::ChipNotDetected);
        }
        let buf = self.read_chip_resumable(output_path, &chip.jedec_id, size)?;
        std::fs::write(output_path, &buf)?;
        super::resume::ResumeState::clear(output_path);
        let mut h = Sha256::new();
        h.update(&buf);
        let checksum: String = hex_encode(&h.finalize());
        let all_ff = buf.iter().all(|&b| b == 0xff);
        let all_zero = buf.iter().all(|&b| b == 0x00);
        Ok((
            ReadResult {
                success: true,
                file_path: output_path.display().to_string(),
                size_bytes: buf.len() as u64,
                duration_ms: start.elapsed().as_millis() as u64,
                checksum,
                all_ff: Some(all_ff),
                all_zero: Some(all_zero),
                error: None,
            },
            buf,
        ))
    }

    /// Whole-chip read that keeps the chunks it completed when contact drops.
    ///
    /// A 32 MB read needs minutes of unbroken contact; a probe on a leadless part
    /// realistically gives tens of seconds. Those numbers do not have to meet: each
    /// attempt keeps its completed 64 KB chunks in the output file and records them
    /// in a sidecar, so re-running reads only what is still missing and enough
    /// attempts add up to a whole dump. Without this, a marginal probe yields no
    /// backup at all -- and no backup is what makes a reflash lose the board's MAC
    /// permanently, since the MAC lives in flash and is not in the vendor image.
    fn read_chip_resumable(
        &mut self,
        output_path: &Path,
        jedec: &str,
        size: usize,
    ) -> Result<Vec<u8>> {
        use super::resume::ResumeState;
        let chunk = READ_CHUNK as u32;
        let (mut state, partial) = ResumeState::load(output_path, jedec, size as u64, chunk);
        // 0xFF, not 0x00: if anything ever escapes with holes, erased-flash bytes are
        // the honest filler. A zero-filled hole is indistinguishable from the dead-bus
        // dumps this whole subsystem exists to reject.
        let mut buf = partial.unwrap_or_else(|| vec![0xffu8; size]);
        let resumed = state.completed_bytes();
        if resumed > 0 {
            eprintln!(
                "resuming read of {jedec}: {resumed}/{size} bytes ({:.1}%) already captured; \
                 reading only what is missing",
                resumed as f64 * 100.0 / size as f64
            );
        }

        for i in 0..state.done.len() {
            if state.done[i] {
                continue;
            }
            let addr = i as u64 * READ_CHUNK as u64;
            let n = (size - addr as usize).min(READ_CHUNK);
            match self.read_chunk_checked(addr, n) {
                Ok(data) => {
                    buf[addr as usize..addr as usize + n].copy_from_slice(&data);
                    state.done[i] = true;
                }
                Err(e) => {
                    // Persist before surfacing the error: this attempt's chunks are the
                    // only thing standing between the user and starting from zero.
                    let saved = state.completed_bytes();
                    std::fs::write(output_path, &buf)?;
                    state.save(output_path)?;
                    return Err(BackendError::Other(format!(
                        "{e}\n\nProgress saved: {saved}/{size} bytes ({:.1}%) captured so far. \
                         Re-seat the probe and re-run the SAME command -- it resumes from here \
                         and reads only what is missing, so short attempts still add up to a \
                         complete dump. The partial file is NOT a usable backup until the read \
                         finishes.",
                        saved as f64 * 100.0 / size as f64
                    )));
                }
            }
            if let Some(cb) = self.progress.as_mut() {
                cb(state.completed_bytes(), size as u64);
            }
        }
        Ok(buf)
    }

    /// Read-back comparison without the trailing EX4B: write_chip's verify step runs
    /// this mid-operation while 4-byte mode must stay active.
    fn verify_against_file(&mut self, file_path: &Path) -> Result<VerifyResult> {
        let start = Instant::now();
        let file_data = std::fs::read(file_path)?;
        // Identify first so 4-byte mode (EN4B) is active before reading back a >16 MB chip;
        // a standalone `verify` would otherwise read with 3-byte addressing.
        self.identify_chip()?;
        let chip_data = self.read_range(0, file_data.len())?;
        let mut hc = Sha256::new();
        hc.update(&chip_data);
        let chip_checksum = hex_encode(&hc.finalize());
        let mut hf = Sha256::new();
        hf.update(&file_data);
        let file_checksum = hex_encode(&hf.finalize());
        Ok(VerifyResult {
            matches: chip_checksum == file_checksum,
            file_path: file_path.display().to_string(),
            chip_checksum,
            file_checksum,
            duration_ms: start.elapsed().as_millis() as u64,
        })
    }

    fn write_chip_inner(&mut self, input_path: &Path, opts: WriteOpts) -> Result<WriteResult> {
        let start = Instant::now();
        let firmware = std::fs::read(input_path)?;
        reject_blank_image(&firmware)?;
        let chip = self.identify_chip()?.ok_or(BackendError::ChipNotDetected)?;
        let chip_size = chip.size_bytes as usize;
        if chip_size == 0 {
            return Err(BackendError::Other(format!(
                "unknown chip capacity for JEDEC id {} — refusing to write blind; \
                 the oversize guard cannot protect an unidentified chip",
                chip.jedec_id
            )));
        }
        if firmware.len() > chip_size {
            return Err(BackendError::Other(format!(
                "image is {} bytes but the chip holds only {} bytes",
                firmware.len(),
                chip_size
            )));
        }
        let page_size = chip.page_size.unwrap_or(256).max(1) as usize;

        // Refuse protected silicon before the (possibly minutes-long) backup read:
        // a protected chip ignores erase/program and would fake-succeed.
        self.ensure_not_write_protected()?;

        // 1. Back up current chip contents BEFORE touching anything (unless told to skip).
        //    A user reflashing a motherboard should never lose their only copy of the old
        //    BIOS — the backup goes to the persistent, owner-only per-user dir (temp_dir
        //    is wiped on reboot and world-readable; dumps can carry NVRAM secrets).
        //    The backup bytes are kept: they are a liveness-checked read of what the chip
        //    currently holds, which is exactly the baseline needed to decide which blocks
        //    already match the image. Reusing it makes the skip check free.
        let (backup_path, baseline) = if opts.skip_backup {
            (None, None)
        } else {
            let path = super::backup::create_private_backup_path("ratchet-backup")?;
            let (_, buf) = self.read_chip_to_file_buf(&path)?;
            (Some(path.display().to_string()), Some(buf))
        };

        // 2. Walk the image one 64 KB block at a time, and for each block: skip it if the
        //    chip already holds the target bytes, otherwise erase + program + read back.
        //
        //    This ordering is a safety property, not a style choice. Erasing the WHOLE chip
        //    and then programming it (the obvious structure) leaves every byte at 0xFF for
        //    the entire programming pass: lose the probe in that window and the board has no
        //    BIOS at all. Per-block, the erased window is one 64 KB block for the ~2 s it
        //    takes to erase and program it, and everything outside that block is either
        //    already-correct new data or still-intact old data.
        //
        //    It is also what makes a write resumable. The chip itself is the progress record:
        //    a re-run reads each block, finds the ones already programmed, and skips them, so
        //    an interrupted write is continued rather than restarted. No sidecar state to go
        //    stale, and running the same write twice is harmless.
        let mut blocks_written = 0usize;
        let mut blocks_skipped = 0usize;
        let mut addr: u64 = 0;
        let end = firmware.len() as u64;
        while addr < end {
            let lo = addr as usize;
            let block_len = BLOCK_64K.min(end - addr) as usize;
            let target = &firmware[lo..lo + block_len];

            // The backup read is the baseline. With skip_backup there is none, and this
            // does NOT go read the chip to synthesise one: the caller opted out of a
            // whole-chip read, so honour that and just write every block. The cost of
            // that choice is losing the skip (and with it resume), not correctness.
            let already_correct = baseline
                .as_ref()
                .filter(|b| b.len() >= lo + block_len)
                .is_some_and(|b| &b[lo..lo + block_len] == target);

            if already_correct {
                blocks_skipped += 1;
            } else {
                self.write_block_verified(addr, target, page_size, !opts.skip_verify)?;
                blocks_written += 1;
            }
            addr += block_len as u64;
            if let Some(cb) = self.progress.as_mut() {
                cb(addr, end);
            }
        }

        // Every block was either read back and compared after programming, or shown to
        // already hold the target bytes by a liveness-checked read. There is no separate
        // whole-chip verify pass: it would re-read 32 MB the loop just read, doubling the
        // time the probe has to stay put for no new information.
        let _ = (blocks_written, blocks_skipped);
        Ok(WriteResult {
            success: true,
            backup_path,
            verified: !opts.skip_verify,
            duration_ms: start.elapsed().as_millis() as u64,
            error: None,
        })
    }

    /// Erase + program + read back one block, retrying the whole unit on failure.
    ///
    /// Retrying at block granularity is what keeps a wobbling probe survivable: a
    /// dropout costs this block, not the write. The retry re-erases before
    /// re-programming, so a half-programmed block from the failed attempt cannot
    /// leave stale 0 bits ANDed into the result.
    fn write_block_verified(
        &mut self,
        addr: u64,
        target: &[u8],
        page_size: usize,
        verify: bool,
    ) -> Result<()> {
        let mut last: Option<String> = None;
        for attempt in 1..=WRITE_BLOCK_ATTEMPTS {
            match self.try_write_block(addr, target, page_size, verify) {
                Ok(()) => return Ok(()),
                Err(e) => last = Some(e.to_string()),
            }
            if attempt < WRITE_BLOCK_ATTEMPTS {
                std::thread::sleep(Duration::from_millis(20));
            }
        }
        Err(BackendError::Other(format!(
            "lost the chip while writing the block at {addr:#x}; {} attempts failed: {}. \
             Re-seat the probe and re-run the SAME write — blocks already programmed are \
             skipped, so it resumes here instead of starting over. Do not boot the board \
             until a write completes: this block is erased or half-programmed.",
            WRITE_BLOCK_ATTEMPTS,
            last.unwrap_or_else(|| "unknown".into())
        )))
    }

    /// One attempt at making `target` the contents of the chip at `addr`.
    fn try_write_block(
        &mut self,
        addr: u64,
        target: &[u8],
        page_size: usize,
        verify: bool,
    ) -> Result<()> {
        // Erase: SPI program only flips 1→0, so the range must read 0xFF first. The
        // stride MUST match the issued opcode or the gaps stay unerased and AND stale
        // data into the image. A full block uses BLOCK_ERASE (~150 ms on a 256 Mb part);
        // only a tail shorter than a block falls back to 4 KB sectors (~45 ms each).
        let block_end = addr + target.len() as u64;
        let mut a = addr;
        while a < block_end {
            if block_end - a >= BLOCK_64K {
                self.block_erase_inner(a)?;
                a += BLOCK_64K;
            } else {
                self.sector_erase_inner(a)?;
                a += 4096;
            }
        }

        // Program page-by-page, never letting a PAGE_PROGRAM cross a page boundary (the
        // chip wraps the address within the page if you do, silently corrupting the write).
        // All-0xFF pages are skipped: the erase above already left them 0xFF, so
        // programming all-ones is a no-op that still costs a WREN, a page program and a
        // WIP poll. Vendor BIOS images run ~45% blank, so this is minutes off the write.
        let mut off = 0usize;
        while off < target.len() {
            let abs = addr as usize + off;
            let page_end = ((abs / page_size + 1) * page_size - addr as usize).min(target.len());
            let page = &target[off..page_end];
            if !page.iter().all(|&b| b == 0xFF) {
                self.page_program(addr + off as u64, page)?;
            }
            off = page_end;
        }

        // Read back through read_range, so the dropout check applies here too: a block
        // that "verifies" against a dead bus is exactly the failure this guards.
        if verify {
            let back = self.read_range(addr, target.len())?;
            if back != target {
                let at = back
                    .iter()
                    .zip(target)
                    .position(|(a, b)| a != b)
                    .unwrap_or(0);
                return Err(BackendError::Other(format!(
                    "read-back mismatch at {:#x} (chip {:#04x}, image {:#04x})",
                    addr + at as u64,
                    back.get(at).copied().unwrap_or(0),
                    target.get(at).copied().unwrap_or(0)
                )));
            }
        }
        Ok(())
    }
}

impl<B: UsbBus> Backend for CH341ABackend<B> {
    fn detect_programmer(&mut self) -> Result<ProgrammerInfo> {
        Ok(ProgrammerInfo {
            kind: "ch341a".into(),
            connected: self.bus.is_some(),
            vendor_id: format!("{:04x}", CH341A_VID),
            product_id: format!("{:04x}", CH341A_PID),
            description: "CH341A USB SPI Programmer".into(),
            backend: "native".into(),
        })
    }
    fn open(&mut self) -> Result<()> {
        self.enable_spi_mode()
    }
    fn close(&mut self) -> Result<()> {
        Ok(())
    }
    fn read_jedec_id(&mut self) -> Result<JedecId> {
        self.rdid()
    }
    fn identify_chip(&mut self) -> Result<Option<ChipInfo>> {
        let id = self.rdid()?;
        let hex = id.to_hex();
        if hex == "000000" || hex == "ffffff" {
            self.jedec_expect = None;
            return Ok(None);
        }
        // Anchor for mid-operation contact checks: a long read that comes back
        // all-zero is only trustworthy if the chip still answers with this id.
        self.jedec_expect = Some([id.manufacturer, id.memory_type, id.capacity]);
        let info = if let Some(db) = lookup_by_jedec_id(&hex) {
            ChipInfo {
                name: db.name.clone(),
                vendor_name: db.vendor.clone(),
                jedec_id: hex.clone(),
                size_bytes: db.size_bytes,
                size_human: format_size(db.size_bytes),
                chip_type: "spi".into(),
                page_size: Some(db.page_size),
                sector_size: Some(db.sector_size),
                block_size: Some(db.block_size),
                write_protected: None,
                voltage: Some(db.voltage),
            }
        } else if let Some(info) = self.identify_via_sfdp(&hex)? {
            info
        } else {
            ChipInfo {
                name: format!("Unknown {}", hex.to_ascii_uppercase()),
                vendor_name: "Unknown".into(),
                jedec_id: hex.clone(),
                size_bytes: 0,
                size_human: "?".into(),
                chip_type: "spi".into(),
                page_size: Some(256),
                sector_size: Some(4096),
                block_size: Some(65536),
                write_protected: None,
                voltage: None,
            }
        };
        // Chips larger than 16 MB need 4-byte addressing; enter it now (sends EN4B) so every
        // subsequent read/write/erase addresses the full chip instead of wrapping at 16 MB.
        let needs_4b = if info.size_bytes > 0 {
            info.size_bytes > SIZE_16MB
        } else {
            needs_4byte_addressing(&hex)
        };
        if needs_4b {
            self.enter_4byte_mode()?;
        }
        Ok(Some(info))
    }
    fn read_status_registers(&mut self) -> Result<StatusRegisters> {
        // Strict reads: this snapshot feeds the write-protection restore after
        // full-repair — a short response read as 0x00 would silently strip a
        // chip's BP bits instead of restoring them.
        let sr1 = self.read_status_strict(SPI_RDSR)?;
        let sr2 = self.read_status_strict(SPI_RDSR2)?;
        let sr3 = self.read_status_strict(SPI_RDSR3)?;
        Ok(StatusRegisters { sr1, sr2, sr3 })
    }
    fn read_sfdp(&mut self) -> Result<Option<SfdpInfo>> {
        // Full JESD216 discovery: header, then the real Basic Flash Parameter
        // Table — density/page/erase geometry come from the chip, not defaults.
        crate::sfdp::discover_sfdp(|addr, len| self.sfdp_read_at(addr, len))
    }
    fn read_chip(&mut self, output_path: &Path) -> Result<ReadResult> {
        let res = self.read_chip_to_file(output_path);
        self.exit_4byte_if_entered();
        res
    }
    fn write_chip(&mut self, input_path: &Path, opts: WriteOpts) -> Result<WriteResult> {
        let res = self.write_chip_inner(input_path, opts);
        self.exit_4byte_if_entered();
        res
    }
    fn verify_chip(&mut self, file_path: &Path) -> Result<VerifyResult> {
        let res = self.verify_against_file(file_path);
        self.exit_4byte_if_entered();
        res
    }
    fn erase_chip(&mut self) -> Result<EraseResult> {
        self.ensure_not_write_protected()?;
        // Identify to size the WIP timeout — chip-erase on 16-32 MB parts runs
        // 200-400 s, far past the old fixed 120 s. Unknown capacity gets the
        // largest supported part's budget (a longer wait is harmless; a timeout
        // mid-erase reads as a dead chip).
        let res = self.identify_chip().and_then(|chip| {
            let timeout = match chip {
                Some(c) if c.size_bytes > 0 => erase_timeout_for(c.size_bytes),
                _ => erase_timeout_for(32 * 1024 * 1024),
            };
            let start = Instant::now();
            self.spi_command(&[SPI_WREN])?;
            self.spi_command(&[SPI_CHIP_ERASE])?;
            self.wait_until_ready(timeout)?;
            Ok(EraseResult {
                success: true,
                duration_ms: start.elapsed().as_millis() as u64,
                error: None,
            })
        });
        self.exit_4byte_if_entered();
        res
    }
    fn sector_erase(&mut self, address: u64) -> Result<EraseResult> {
        self.ensure_not_write_protected()?;
        let res = self
            .prepare_erase_addressing(address.saturating_add(1))
            .and_then(|()| self.sector_erase_inner(address));
        self.exit_4byte_if_entered();
        res
    }
    fn block_erase(&mut self, address: u64) -> Result<EraseResult> {
        self.ensure_not_write_protected()?;
        let res = self
            .prepare_erase_addressing(address.saturating_add(1))
            .and_then(|()| self.block_erase_inner(address));
        self.exit_4byte_if_entered();
        res
    }
    fn region_erase(&mut self, start_addr: u64, length: u64) -> Result<EraseResult> {
        // Sector-by-sector erase across the range; each sector_erase waits for WIP to clear.
        // Protection is checked once up front, not per sector.
        self.ensure_not_write_protected()?;
        let res = self
            .prepare_erase_addressing(start_addr.saturating_add(length))
            .and_then(|()| {
                let start = Instant::now();
                let mut addr = start_addr & !0xfff;
                let end = start_addr + length;
                while addr < end {
                    self.sector_erase_inner(addr)?;
                    addr += 4096;
                }
                Ok(EraseResult {
                    success: true,
                    duration_ms: start.elapsed().as_millis() as u64,
                    error: None,
                })
            });
        self.exit_4byte_if_entered();
        res
    }
    fn is_write_protected(&mut self) -> Result<bool> {
        let sr = self.read_status_registers()?;
        Ok((sr.sr1 & SR_BP_MASK) != 0)
    }
    fn disable_write_protection(&mut self) -> Result<()> {
        self.spi_command(&[SPI_EWSR])?;
        self.spi_command(&[SPI_WRSR, 0])?;
        // WRSR starts an internal status-register write cycle (WIP set); issuing the
        // next command before it completes races the register update.
        self.wait_until_ready(PAGE_PROGRAM_TIMEOUT)
    }
    fn restore_write_protection(&mut self, sr1: u8) -> Result<()> {
        // Re-apply only the BP bits — writing the raw saved SR1 could set
        // unrelated control bits (SRP, QE on some parts) by accident.
        self.spi_command(&[SPI_EWSR])?;
        self.spi_command(&[SPI_WRSR, sr1 & SR_BP_MASK])?;
        self.wait_until_ready(PAGE_PROGRAM_TIMEOUT)
    }
    fn connection_test(&mut self) -> Result<ConnectionTestResult> {
        let mut ids = Vec::with_capacity(10);
        let mut timings = Vec::with_capacity(10);
        for _ in 0..10 {
            let t0 = Instant::now();
            let id = self.rdid()?.to_hex();
            timings.push(t0.elapsed().as_millis() as u32);
            ids.push(id);
        }
        let first = ids[0].clone();
        let matches = ids.iter().filter(|id| *id == &first).count() as u32;
        let stable = matches == 10;
        let sr = self.read_status_registers().ok();
        Ok(ConnectionTestResult {
            stable,
            reads: 10,
            matches,
            jedec_id: first,
            timings,
            status_register: sr.map(|s| s.sr1),
            error: None,
        })
    }
    fn reset_chip(&mut self) -> Result<()> {
        // JEDEC software reset: 0x66 (enable reset) then 0x99 (reset), each in
        // its own CS frame, then a settle delay (tRST is ≤30 µs on common parts;
        // 1 ms is comfortably safe). The previous implementation was a no-op
        // that reported success.
        self.spi_command(&[SPI_RESET_ENABLE])?;
        self.spi_command(&[SPI_RESET])?;
        std::thread::sleep(Duration::from_millis(1));
        // Reset returns the chip to power-on state, including 3-byte addressing.
        self.use_4byte_addr = false;
        Ok(())
    }

    fn set_progress_callback(&mut self, cb: super::ProgressFn) {
        self.progress = Some(cb);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Per-process temp path: two concurrent `cargo test` processes (CI shards,
    /// parallel audits) racing on ONE fixed filename gave spurious ENOENT when
    /// one process deleted the other's input mid-test.
    fn test_tmp(name: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!("ratchet-test-{}-{}", std::process::id(), name))
    }

    /// Chip-semantic bytes → wire form. The CH341A shifter is LSB-first, so
    /// this is what a MockBus must return for the driver's rx reversal to hand
    /// back these bytes. Keeps test literals readable (0xef 0x40 0x17, not
    /// their mirror images).
    fn chip_rx(mut data: Vec<u8>) -> Vec<u8> {
        reverse_bits_in_place(&mut data);
        data
    }

    /// Recorded bus writes with every CMD_SPI_STREAM payload reversed back to
    /// chip semantics, so asserts read as the CHIP sees them. UIO packets
    /// (CS / mode setup) pass through untouched.
    fn chip_writes(writes: &[Vec<u8>]) -> Vec<Vec<u8>> {
        writes
            .iter()
            .map(|w| {
                let mut w = w.clone();
                if w.first() == Some(&CMD_SPI_STREAM) {
                    reverse_bits_in_place(&mut w[1..]);
                }
                w
            })
            .collect()
    }

    #[test]
    fn enable_spi_mode_packet_layout() {
        let pkt = enable_spi_mode_packet();
        assert_eq!(pkt[0], CMD_UIO_STREAM);
        assert_eq!(pkt[1], UIO_STM_OUT | STM_SPI_CS);
        // DIR must drive D0-D5 (0x3F, the flashrom/ch341prog mask). A narrower
        // mask leaves SCK/MOSI hi-Z: the chip never receives a command and the
        // bus reads all-zero even with perfect contact.
        assert_eq!(pkt[2], UIO_STM_DIR | STM_SPI_DIR_OUTPUTS);
        assert_eq!(pkt[2] & 0x08, 0x08, "SCK (D3) must be an output");
        assert_eq!(pkt[2] & 0x20, 0x20, "MOSI (D5) must be an output");
        assert_eq!(pkt[2] & 0x80, 0, "MISO (D7) must stay an input");
        assert_eq!(pkt[3], UIO_STM_END);
    }

    #[test]
    fn cs_assert_and_deassert_differ_by_cs_bit() {
        let a = cs_assert_packet();
        let d = cs_deassert_packet();
        assert_eq!(a[0], CMD_UIO_STREAM);
        assert_eq!(d[0], CMD_UIO_STREAM);
        // Assert pulls CS low (no CS bit set in the OUT mask); deassert sets CS high.
        assert_eq!(a[1] & STM_SPI_CS, 0);
        assert_eq!(d[1] & STM_SPI_CS, STM_SPI_CS);
    }

    #[test]
    fn address_bytes_3byte_mode() {
        assert_eq!(address_bytes(0x123456, false), vec![0x12, 0x34, 0x56]);
        assert_eq!(address_bytes(0x000000, false), vec![0x00, 0x00, 0x00]);
        assert_eq!(address_bytes(0xffffff, false), vec![0xff, 0xff, 0xff]);
    }

    #[test]
    fn address_bytes_4byte_mode() {
        assert_eq!(
            address_bytes(0x01234567, true),
            vec![0x01, 0x23, 0x45, 0x67]
        );
        assert_eq!(
            address_bytes(0xdeadbeef, true),
            vec![0xde, 0xad, 0xbe, 0xef]
        );
    }

    #[test]
    fn spi_stream_single_packet_under_31_bytes() {
        let tx = vec![SPI_RDID, 0, 0, 0];
        let chunks = spi_stream_chunks(&tx);
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0][0], CMD_SPI_STREAM);
        // Payload goes out bit-reversed for the CH341A's LSB-first shifter.
        let wire: Vec<u8> = tx.iter().map(|b| b.reverse_bits()).collect();
        assert_eq!(&chunks[0][1..], &wire[..]);
    }

    #[test]
    fn spi_stream_chunks_31_byte_boundary() {
        let tx = vec![0xaa; 31];
        let chunks = spi_stream_chunks(&tx);
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0].len(), 32); // 1 cmd byte + 31 data
    }

    #[test]
    fn spi_stream_chunks_split_at_31_bytes() {
        let tx = vec![0xbb; 70];
        let chunks = spi_stream_chunks(&tx);
        // 70 / 31 = 2 full + 1 partial = 3 chunks
        assert_eq!(chunks.len(), 3);
        assert_eq!(chunks[0].len(), 32);
        assert_eq!(chunks[1].len(), 32);
        assert_eq!(chunks[2].len(), 9); // cmd + 8 leftover
        for c in &chunks {
            assert_eq!(c[0], CMD_SPI_STREAM);
        }
    }

    #[test]
    fn decode_jedec_winbond_w25q64() {
        // Cmd echo at index 0, then mfr/type/cap.
        let rx = vec![0x00, 0xef, 0x40, 0x17];
        let id = decode_jedec_response(&rx).unwrap();
        assert_eq!(id.to_hex(), "ef4017");
    }

    #[test]
    fn decode_jedec_too_short_returns_none() {
        assert!(decode_jedec_response(&[0; 3]).is_none());
    }

    #[test]
    fn backend_open_writes_enable_spi_packet() {
        let mut backend = CH341ABackend::with_bus(MockBus::new());
        backend.open().unwrap();
        let bus = backend.bus.as_ref().unwrap();
        assert_eq!(chip_writes(&bus.writes).len(), 1);
        assert_eq!(
            chip_writes(&bus.writes)[0],
            enable_spi_mode_packet().to_vec()
        );
    }

    #[test]
    fn backend_rdid_wraps_in_cs_pulses_and_returns_decoded_id() {
        let mut bus = MockBus::new();
        // Response to bulk_read after the 4-byte SPI_RDID: cmd echo + 3 ID bytes.
        bus.queue_read(chip_rx(vec![0x00, 0xef, 0x40, 0x17]));
        let mut backend = CH341ABackend::with_bus(bus);
        let id = backend.rdid().unwrap();
        assert_eq!(id.to_hex(), "ef4017");

        // Writes: cs_assert, spi_stream_packet(RDID+3x0), cs_deassert.
        let bus = backend.bus.as_ref().unwrap();
        assert_eq!(chip_writes(&bus.writes).len(), 3);
        assert_eq!(chip_writes(&bus.writes)[0], cs_assert_packet().to_vec());
        assert_eq!(chip_writes(&bus.writes)[1][0], CMD_SPI_STREAM);
        assert_eq!(chip_writes(&bus.writes)[1][1], SPI_RDID);
        assert_eq!(chip_writes(&bus.writes)[2], cs_deassert_packet().to_vec());
    }

    #[test]
    fn backend_erase_chip_sends_wren_then_chip_erase_then_polls_wip() {
        let mut bus = MockBus::new();
        // Write-protect guard RDSR, identify RDID (zeros → unknown), WREN read,
        // CHIP_ERASE read, then one RDSR poll whose byte[1]=0 → WIP clear.
        for _ in 0..5 {
            bus.queue_read(chip_rx(vec![0; 8]));
        }
        let mut backend = CH341ABackend::with_bus(bus);
        backend.erase_chip().unwrap();
        let bus = backend.bus.as_ref().unwrap();
        // Frames: [guard RDSR][RDID][WREN][CHIP_ERASE][poll RDSR], 3 writes each (cs, pkt, cs).
        assert_eq!(chip_writes(&bus.writes)[7][1], SPI_WREN);
        assert_eq!(chip_writes(&bus.writes)[10][1], SPI_CHIP_ERASE);
        // A WIP poll (RDSR 0x05) must follow the erase — otherwise we'd race the busy chip.
        assert!(chip_writes(&bus.writes)
            .iter()
            .any(|w| w.len() >= 2 && w[0] == CMD_SPI_STREAM && w[1] == SPI_RDSR));
    }

    #[test]
    fn reset_chip_sends_enable_reset_then_reset() {
        // JEDEC software reset is 0x66 then 0x99 in separate CS frames. The old
        // implementation was a no-op Ok(()) — the REPL printed "reset ok" while
        // nothing reached the chip.
        let mut bus = MockBus::new();
        bus.queue_read(chip_rx(vec![0u8; 8])); // 0x66 echo
        bus.queue_read(chip_rx(vec![0u8; 8])); // 0x99 echo
        let mut backend = CH341ABackend::with_bus(bus);
        backend.use_4byte_addr = true;
        backend.reset_chip().unwrap();
        assert!(
            !backend.use_4byte_addr,
            "reset returns the chip to power-on 3-byte addressing"
        );
        let writes = &chip_writes(&backend.bus.as_ref().unwrap().writes);
        let ops: Vec<u8> = writes
            .iter()
            .filter(|w| w.len() >= 2 && w[0] == CMD_SPI_STREAM)
            .map(|w| w[1])
            .collect();
        assert_eq!(
            ops,
            vec![SPI_RESET_ENABLE, SPI_RESET],
            "must send 0x66 then 0x99, in that order"
        );
    }

    #[test]
    fn erase_timeout_scales_with_capacity() {
        // 8 MB stays at the 120 s floor; 16/32 MB scale up past their worst-case
        // datasheet erase times (200 s / 400 s).
        assert_eq!(erase_timeout_for(8 * 1024 * 1024), Duration::from_secs(120));
        assert!(erase_timeout_for(16 * 1024 * 1024) >= Duration::from_secs(200));
        assert!(erase_timeout_for(32 * 1024 * 1024) >= Duration::from_secs(400));
        assert!(
            erase_timeout_for(32 * 1024 * 1024) > erase_timeout_for(16 * 1024 * 1024),
            "timeout must grow with capacity"
        );
        // Unknown (0) capacity must still get a sane floor, never zero.
        assert_eq!(erase_timeout_for(0), Duration::from_secs(120));
    }

    #[test]
    fn erase_chip_refuses_when_write_protected() {
        let mut bus = MockBus::new();
        // Guard RDSR returns BP bits set → must refuse before any WREN/CHIP_ERASE.
        bus.queue_read(chip_rx(vec![0x00, SR_BP_MASK]));
        let mut backend = CH341ABackend::with_bus(bus);
        let err = backend.erase_chip().unwrap_err();
        assert!(matches!(err, BackendError::WriteProtected));
        let writes = &chip_writes(&backend.bus.as_ref().unwrap().writes);
        assert!(
            !writes.iter().any(|w| w.len() >= 2
                && w[0] == CMD_SPI_STREAM
                && (w[1] == SPI_WREN || w[1] == SPI_CHIP_ERASE)),
            "no write-enable or erase may reach a protected chip"
        );
    }

    #[test]
    fn sector_erase_refuses_when_write_protected() {
        let mut bus = MockBus::new();
        bus.queue_read(chip_rx(vec![0x00, SR_BP_MASK]));
        let mut backend = CH341ABackend::with_bus(bus);
        let err = backend.sector_erase(0).unwrap_err();
        assert!(matches!(err, BackendError::WriteProtected));
    }

    #[test]
    fn write_chip_refuses_unknown_capacity_chip() {
        // JEDEC id aabb11 is not in the chip DB and exposes no SFDP table → size_bytes
        // 0 → must refuse, not skip the oversize guard and write blind. (Capacity byte
        // 0x11 < 0x19 keeps the 4-byte-addressing heuristic quiet.)
        let path = test_tmp("unknown-capacity.bin");
        std::fs::write(&path, vec![0xa5u8; 64]).unwrap();
        let mut bus = MockBus::new();
        bus.queue_read(chip_rx(vec![0x00, 0xaa, 0xbb, 0x11])); // RDID → unlisted id
        bus.queue_read(chip_rx(vec![0u8; 21])); // SFDP probe → no signature → size stays 0
        let mut backend = CH341ABackend::with_bus(bus);
        let err = backend
            .write_chip(
                &path,
                WriteOpts {
                    skip_backup: true,
                    skip_verify: true,
                },
            )
            .unwrap_err();
        assert!(format!("{err}").contains("unknown chip capacity"));
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn disable_write_protection_polls_wip_after_wrsr() {
        let mut bus = MockBus::new();
        bus.queue_read(chip_rx(vec![0u8; 8])); // EWSR
        bus.queue_read(chip_rx(vec![0u8; 8])); // WRSR
        bus.queue_read(chip_rx(vec![0x00, SR_WIP])); // status-register write still running
        bus.queue_read(chip_rx(vec![0x00, 0x00])); // done
        let mut backend = CH341ABackend::with_bus(bus);
        backend.disable_write_protection().unwrap();
        let writes = &chip_writes(&backend.bus.as_ref().unwrap().writes);
        let rdsr_polls = writes
            .iter()
            .filter(|w| w.len() >= 2 && w[0] == CMD_SPI_STREAM && w[1] == SPI_RDSR)
            .count();
        assert!(
            rdsr_polls >= 2,
            "WRSR must be followed by WIP polling (saw {rdsr_polls} RDSR frames)"
        );
    }

    #[test]
    fn write_chip_erases_full_range_when_sector_size_not_4k() {
        // EN25P05 (1c2010) reports sectorSize=65536 in the DB, but the erase loop
        // issues the 4 KB sector-erase opcode (0x20). Striding by 64 KB would erase
        // only the first 4 KB of each 64 KB step, AND-ing stale data into the rest
        // of the image. Every 4 KB of the programmed range must receive an erase.
        let path = test_tmp("erase-stride.bin");
        std::fs::write(&path, vec![0xa5u8; 8192]).unwrap();
        let mut bus = MockBus::new();
        bus.queue_read(chip_rx(vec![0x00, 0x1c, 0x20, 0x10])); // RDID → EN25P05 (64 KB, sectorSize 64 KB)
        for _ in 0..600 {
            bus.queue_read(chip_rx(vec![0u8; 40])); // WP guard, WREN/erase/poll, program chunks
        }
        let mut backend = CH341ABackend::with_bus(bus);
        backend
            .write_chip(
                &path,
                WriteOpts {
                    skip_backup: true,
                    skip_verify: true,
                },
            )
            .unwrap();
        let writes = &chip_writes(&backend.bus.as_ref().unwrap().writes);
        let erase_addrs: Vec<u32> = writes
            .iter()
            .filter(|w| w.len() >= 5 && w[0] == CMD_SPI_STREAM && w[1] == SPI_SECTOR_ERASE)
            .map(|w| u32::from_be_bytes([0, w[2], w[3], w[4]]))
            .collect();
        assert_eq!(
            erase_addrs,
            vec![0x0000, 0x1000],
            "every 4 KB of the 8 KB image must be erased (got {erase_addrs:x?})"
        );
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn write_chip_erases_whole_blocks_with_the_block_opcode_and_covers_the_tail() {
        // Erasing a 32 MB image 4 KB at a time is 8192 erases at ~45 ms typical:
        // ~6 minutes of hand-on-probe time. 64 KB blocks do it in 512 at ~150 ms.
        // Both leave 0xFF, so the only property that matters is that the union of
        // erased ranges still covers every byte the program step will touch --
        // any gap ANDs stale data into the image.
        let path = test_tmp("erase-block-stride.bin");
        let len = 128 * 1024 + 4096; // two whole blocks plus a short tail
        std::fs::write(&path, vec![0xa5u8; len]).unwrap();
        let mut bus = MockBus::new();
        bus.queue_read(chip_rx(vec![0x00, 0xef, 0x40, 0x18])); // RDID → W25Q128, 16 MB, 3-byte addr
        for _ in 0..6000 {
            bus.queue_read(chip_rx(vec![0u8; 40]));
        }
        let mut backend = CH341ABackend::with_bus(bus);
        backend
            .write_chip(
                &path,
                WriteOpts {
                    skip_backup: true,
                    skip_verify: true,
                },
            )
            .unwrap();
        let writes = &chip_writes(&backend.bus.as_ref().unwrap().writes);
        let mut covered = vec![false; len];
        for w in writes {
            if w.len() < 5 || w[0] != CMD_SPI_STREAM {
                continue;
            }
            let size = match w[1] {
                SPI_BLOCK_ERASE => 64 * 1024usize,
                SPI_SECTOR_ERASE => 4096,
                _ => continue,
            };
            let a = u32::from_be_bytes([0, w[2], w[3], w[4]]) as usize;
            for byte in covered.iter_mut().skip(a).take(size) {
                *byte = true;
            }
        }
        assert!(
            covered.iter().all(|&c| c),
            "every byte of the image range must be erased -- an unerased gap corrupts the write"
        );
        let blocks = writes
            .iter()
            .filter(|w| w.len() >= 5 && w[0] == CMD_SPI_STREAM && w[1] == SPI_BLOCK_ERASE)
            .count();
        assert_eq!(blocks, 2, "the two whole 64 KB blocks use the block opcode");
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn write_chip_skips_pages_that_are_already_blank() {
        // The erase step just left this range at 0xFF, so programming an all-0xFF
        // page writes nothing while still costing a WREN, a page program and a WIP
        // poll. Vendor BIOS images run ~45% blank (the ASUS 5044 image is 45.6%),
        // so skipping them is minutes off the write for identical resulting bytes.
        let path = test_tmp("skip-blank-pages.bin");
        let mut img = vec![0xffu8; 1024];
        img[0..256].fill(0xa5); // page 0 has data
        img[512..768].fill(0x5a); // page 2 has data; pages 1 and 3 stay blank
        std::fs::write(&path, &img).unwrap();
        let mut bus = MockBus::new();
        bus.queue_read(chip_rx(vec![0x00, 0xef, 0x40, 0x18])); // RDID → W25Q128
        for _ in 0..600 {
            bus.queue_read(chip_rx(vec![0u8; 40]));
        }
        let mut backend = CH341ABackend::with_bus(bus);
        backend
            .write_chip(
                &path,
                WriteOpts {
                    skip_backup: true,
                    skip_verify: true,
                },
            )
            .unwrap();
        let writes = &chip_writes(&backend.bus.as_ref().unwrap().writes);
        let programmed: Vec<u32> = writes
            .iter()
            .filter(|w| w.len() >= 5 && w[0] == CMD_SPI_STREAM && w[1] == SPI_PAGE_PROGRAM)
            .map(|w| u32::from_be_bytes([0, w[2], w[3], w[4]]))
            .collect();
        assert_eq!(
            programmed,
            vec![0x000, 0x200],
            "only the two non-blank pages get programmed (got {programmed:x?})"
        );
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn region_erase_uses_4byte_addressing_above_16mb() {
        // W25Q256 (ef4019) = 32 MB. A standalone region-erase above 16 MB must
        // identify first, enter 4-byte mode, issue the 4-byte sector-erase opcode
        // (0x21) with all four address bytes, and exit 4-byte mode afterwards.
        // Without that, the 3-byte frame wraps and the WRONG sector is destroyed.
        let mut bus = MockBus::new();
        bus.queue_read(chip_rx(vec![0x00, 0x00])); // WP guard RDSR → unprotected
        bus.queue_read(chip_rx(vec![0x00, 0xef, 0x40, 0x19])); // RDID → W25Q256
        bus.queue_read(chip_rx(vec![0u8; 8])); // WREN (enter 4-byte, Micron gate)
        bus.queue_read(chip_rx(vec![0u8; 8])); // EN4B
        bus.queue_read(chip_rx(vec![0u8; 8])); // WREN (erase)
        bus.queue_read(chip_rx(vec![0u8; 8])); // sector erase cmd
        bus.queue_read(chip_rx(vec![0x00, 0x00])); // WIP poll → ready
        bus.queue_read(chip_rx(vec![0u8; 8])); // WREN (exit 4-byte, Micron gate)
        bus.queue_read(chip_rx(vec![0u8; 8])); // EX4B
        let mut backend = CH341ABackend::with_bus(bus);
        backend.region_erase(0x0100_0000, 4096).unwrap();
        assert!(!backend.use_4byte_addr, "must exit 4-byte mode afterwards");
        let writes = &chip_writes(&backend.bus.as_ref().unwrap().writes);
        assert!(
            writes
                .iter()
                .any(|w| w.len() >= 2 && w[0] == CMD_SPI_STREAM && w[1] == SPI_EN4B),
            "EN4B must be sent before erasing above 16 MB"
        );
        assert!(
            writes.iter().any(|w| w.len() >= 6
                && w[0] == CMD_SPI_STREAM
                && w[1] == SPI_SECTOR_ERASE_4B
                && w[2..6] == [0x01, 0x00, 0x00, 0x00]),
            "erase must use the 4-byte opcode (0x21) with the full 4-byte address"
        );
        assert!(
            writes
                .iter()
                .any(|w| w.len() >= 2 && w[0] == CMD_SPI_STREAM && w[1] == SPI_EX4B),
            "EX4B must restore 3-byte mode after the erase"
        );
    }

    #[test]
    fn region_erase_refuses_out_of_range_in_3byte_mode() {
        // W25Q128 (ef4018) = 16 MB stays in 3-byte mode; a region beyond 16 MB
        // cannot be expressed in a 3-byte frame and must be refused, not wrapped.
        let mut bus = MockBus::new();
        bus.queue_read(chip_rx(vec![0x00, 0x00])); // WP guard RDSR → unprotected
        bus.queue_read(chip_rx(vec![0x00, 0xef, 0x40, 0x18])); // RDID → W25Q128
        let mut backend = CH341ABackend::with_bus(bus);
        let err = backend.region_erase(0x0100_0000, 4096).unwrap_err();
        assert!(
            format!("{err}").contains("3-byte"),
            "refusal must explain the 3-byte addressing limit, got: {err}"
        );
        let writes = &chip_writes(&backend.bus.as_ref().unwrap().writes);
        assert!(
            !writes.iter().any(|w| w.len() >= 2
                && w[0] == CMD_SPI_STREAM
                && (w[1] == SPI_SECTOR_ERASE || w[1] == SPI_SECTOR_ERASE_4B)),
            "no erase opcode may reach the chip for an unaddressable range"
        );
    }

    #[test]
    fn restore_write_protection_writes_bp_bits_only() {
        // Restore must re-apply the saved BP bits via EWSR+WRSR (masked to the
        // BP field so stray SRP/QE bits are never written) and poll WIP.
        let mut bus = MockBus::new();
        bus.queue_read(chip_rx(vec![0u8; 8])); // EWSR
        bus.queue_read(chip_rx(vec![0u8; 8])); // WRSR
        bus.queue_read(chip_rx(vec![0x00, 0x00])); // WIP poll → done
        let mut backend = CH341ABackend::with_bus(bus);
        backend.restore_write_protection(0xfc).unwrap();
        let writes = &chip_writes(&backend.bus.as_ref().unwrap().writes);
        let wrsr = writes
            .iter()
            .find(|w| w.len() >= 3 && w[0] == CMD_SPI_STREAM && w[1] == SPI_WRSR)
            .expect("WRSR frame must be sent");
        assert_eq!(
            wrsr[2],
            0xfc & SR_BP_MASK,
            "only the BP bits may be re-applied"
        );
        assert!(
            writes
                .iter()
                .any(|w| w.len() >= 2 && w[0] == CMD_SPI_STREAM && w[1] == SPI_EWSR),
            "EWSR must precede the status-register write"
        );
    }

    #[test]
    fn verify_chip_exits_4byte_mode_after_completion() {
        // >16 MB chip (ef4019): verify enters 4-byte mode for the read-back, then must
        // exit (EX4B 0xe9) so the chip is not left misaddressing for the next tool.
        let path = test_tmp("ex4b-verify.bin");
        std::fs::write(&path, vec![0xa5u8; 32]).unwrap();
        let mut bus = MockBus::new();
        // Filler that ALSO decodes as ef4019 when read as an RDID response: read_range
        // now re-checks the chip id after every chunk, so a plain 0xa5 filler would
        // decode as a5a5a5 and (correctly) trip the contact check.
        let rdid_ok = || {
            let mut v = vec![0x00, 0xef, 0x40, 0x19];
            v.resize(40, 0xa5);
            chip_rx(v)
        };
        for _ in 0..10 {
            bus.queue_read(rdid_ok()); // identify RDID, EN4B, read chunk, liveness RDID, EX4B
        }
        let mut backend = CH341ABackend::with_bus(bus);
        backend.verify_chip(&path).unwrap();
        assert!(
            !backend.use_4byte_addr,
            "4-byte flag must be cleared after the operation"
        );
        let writes = &chip_writes(&backend.bus.as_ref().unwrap().writes);
        assert!(
            writes
                .iter()
                .any(|w| w.len() >= 2 && w[0] == CMD_SPI_STREAM && w[1] == SPI_EX4B),
            "EX4B (0xe9) must be sent after an operation that entered 4-byte mode"
        );
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn backend_sector_erase_uses_3byte_addr_by_default() {
        let mut bus = MockBus::new();
        // Guard RDSR, identify RDID (zeros → no chip), WREN, SECTOR_ERASE, RDSR poll.
        for _ in 0..5 {
            bus.queue_read(chip_rx(vec![0; 8]));
        }
        let mut backend = CH341ABackend::with_bus(bus);
        backend.sector_erase(0x123456).unwrap();
        let bus = backend.bus.as_ref().unwrap();
        // writes[10] = stream packet for SECTOR_ERASE (after guard + RDID + WREN frames)
        let pkt = &chip_writes(&bus.writes)[10];
        assert_eq!(pkt[0], CMD_SPI_STREAM);
        assert_eq!(pkt[1], SPI_SECTOR_ERASE);
        assert_eq!(&pkt[2..5], &[0x12, 0x34, 0x56]);
    }

    #[test]
    fn backend_sector_erase_uses_4byte_when_enabled() {
        let mut bus = MockBus::new();
        // Guard RDSR, identify RDID, WREN, SECTOR_ERASE, RDSR poll, trailing EX4B.
        for _ in 0..6 {
            bus.queue_read(chip_rx(vec![0; 8]));
        }
        let mut backend = CH341ABackend::with_bus(bus);
        backend.use_4byte_addr = true;
        backend.sector_erase(0x01020304).unwrap();
        let bus = backend.bus.as_ref().unwrap();
        let pkt = &chip_writes(&bus.writes)[10];
        assert_eq!(pkt[1], SPI_SECTOR_ERASE_4B);
        assert_eq!(&pkt[2..6], &[0x01, 0x02, 0x03, 0x04]);
    }

    /// A bus that always returns fewer bytes than requested — exercises the
    /// fail-closed paths for garbled/short transport reads.
    struct ShortReadBus;
    impl UsbBus for ShortReadBus {
        fn bulk_write(&mut self, _data: &[u8]) -> Result<()> {
            Ok(())
        }
        fn bulk_read(&mut self, _len: usize) -> Result<Vec<u8>> {
            Ok(vec![0u8; 1])
        }
    }

    #[test]
    fn short_status_read_fails_closed() {
        // A short RDSR response must NEVER be interpreted as "ready" — the old
        // .get(1).unwrap_or(0) read a starved bus as WIP-clear, green-lighting
        // the next destructive command exactly when the bus was flakiest.
        let mut backend = CH341ABackend::with_bus(ShortReadBus);
        let err = backend
            .wait_until_ready(Duration::from_millis(10))
            .unwrap_err();
        assert!(
            format!("{err}").contains("short RDSR"),
            "ready-poll must fail closed on a short status read, got: {err}"
        );

        // Same for the write-protect guard: a short response must not read as
        // "unprotected" (BP bits clear).
        let mut backend = CH341ABackend::with_bus(ShortReadBus);
        let err = backend.erase_chip().unwrap_err();
        assert!(
            format!("{err}").contains("short RDSR"),
            "WP guard must fail closed on a short status read, got: {err}"
        );
    }

    #[test]
    fn status_register_snapshot_fails_closed() {
        // read_status_registers feeds the post-repair write-protection restore:
        // a short RDSR snapshotted as sr1=0x00 would make full-repair re-apply
        // BP=0 and leave a protected BIOS chip silently UNPROTECTED. The
        // snapshot must hard-error instead of defaulting to zeros.
        let mut backend = CH341ABackend::with_bus(ShortReadBus);
        let err = backend.read_status_registers().unwrap_err();
        assert!(
            format!("{err}").contains("short RDSR"),
            "status snapshot must fail closed on a short read, got: {err}"
        );
    }

    #[test]
    fn short_bulk_read_is_hard_error() {
        // A bus that answers the opcode/address echo fully but starves the data
        // chunks. The old code appended the short slice and kept going — every
        // subsequent byte shifted left, silently corrupting backups and verifies.
        struct HeaderThenShortBus {
            reads: usize,
        }
        impl UsbBus for HeaderThenShortBus {
            fn bulk_write(&mut self, _d: &[u8]) -> Result<()> {
                Ok(())
            }
            fn bulk_read(&mut self, len: usize) -> Result<Vec<u8>> {
                self.reads += 1;
                if self.reads == 1 {
                    Ok(vec![0u8; len]) // header echo
                } else {
                    Ok(vec![0u8; len.saturating_sub(1)]) // short data chunk
                }
            }
        }
        let mut backend = CH341ABackend::with_bus(HeaderThenShortBus { reads: 0 });
        let err = backend.read_range(0, 64).unwrap_err();
        // Retried first (a short chunk is what a wobbling probe produces), then
        // failed closed. What matters is that it aborts and says why, never that it
        // pads the range out to length.
        let msg = err.to_string();
        assert!(
            msg.contains("short transfer"),
            "short data chunk must abort the read and name the cause, got: {msg}"
        );
    }

    /// Bus that clocks out solid 0x00 for data reads (the dead-bus signature) while
    /// answering RDID with a configurable id. Lets a test drive the exact ambiguity
    /// the contact check exists to resolve: are these zeros real flash content, or
    /// is the probe simply not touching the chip?
    struct ZeroDataBus {
        id: [u8; 3],
        rdid_next: bool,
    }
    impl UsbBus for ZeroDataBus {
        fn bulk_write(&mut self, d: &[u8]) -> Result<()> {
            // Payload is bit-reversed on the wire; un-reverse to spot an RDID frame.
            self.rdid_next =
                d.len() >= 2 && d[0] == CMD_SPI_STREAM && d[1].reverse_bits() == SPI_RDID;
            Ok(())
        }
        fn bulk_read(&mut self, len: usize) -> Result<Vec<u8>> {
            if self.rdid_next {
                let mut v = vec![0u8, self.id[0], self.id[1], self.id[2]];
                v.resize(len, 0);
                Ok(chip_rx(v))
            } else {
                Ok(vec![0u8; len]) // 0x00 is bit-order invariant
            }
        }
    }

    #[test]
    fn pack_spi_stream_keeps_every_packet_full_except_the_last() {
        // The IN ring sizes its transfers assuming the device answers exactly 31
        // bytes per full command packet. If pack_spi_stream ever emitted a short
        // packet in the middle, that reply would be short too, the ring would
        // mis-frame from that point on, and the dump would be silently misaligned.
        for len in [1usize, 30, 31, 32, 61, 62, 63, 4096, 65541] {
            let tx: Vec<u8> = (0..len).map(|i| (i % 251) as u8).collect();
            let packed = pack_spi_stream(&tx);
            let mut sizes = Vec::new();
            let mut i = 0;
            let mut recovered = Vec::new();
            while i < packed.len() {
                assert_eq!(packed[i], CMD_SPI_STREAM, "each packet starts with 0xA8");
                let payload = (packed.len() - i - 1).min(MAX_XFER - 1);
                sizes.push(payload);
                let mut chunk = packed[i + 1..i + 1 + payload].to_vec();
                reverse_bits_in_place(&mut chunk); // undo the LSB-first shifter
                recovered.extend_from_slice(&chunk);
                i += 1 + payload;
            }
            assert_eq!(recovered, tx, "payload must round-trip for len {len}");
            assert_eq!(
                sizes.len(),
                len.div_ceil(MAX_XFER - 1),
                "packet count for len {len}"
            );
            if let Some((last, rest)) = sizes.split_last() {
                assert!(
                    rest.iter().all(|&s| s == MAX_XFER - 1),
                    "only the final packet may be short (len {len}, sizes {sizes:?})"
                );
                assert!(*last > 0 && *last < MAX_XFER);
            }
            // Total wire bytes = payload + one command byte per packet, matching the
            // length flashrom passes to its usb_transfer().
            assert_eq!(packed.len(), len + len.div_ceil(MAX_XFER - 1));
        }
    }

    #[test]
    fn pack_spi_stream_empty_is_empty() {
        assert!(pack_spi_stream(&[]).is_empty());
    }

    #[test]
    fn read_refuses_all_zero_range_when_chip_stops_answering() {
        // This is the failure that produced a 33 MB "backup" that was 67% zeros and
        // reported success. A range of solid 0x00 plus a chip that no longer answers
        // RDID means the probe lost contact; the bytes are garbage and must never
        // reach disk looking like a valid dump.
        let mut backend = CH341ABackend::with_bus(ZeroDataBus {
            id: [0x00, 0x00, 0x00],
            rdid_next: false,
        });
        let err = backend.read_range(0, 128).unwrap_err();
        let msg = err.to_string();
        assert!(
            msg.contains("lost contact"),
            "dead bus must fail closed, got: {msg}"
        );
        assert!(
            msg.contains("0x0"),
            "error must name the offset so the user knows where it died: {msg}"
        );
    }

    #[test]
    fn read_accepts_all_zero_range_when_chip_still_answers() {
        // The other half of the discriminator: an all-0x00 range is legal firmware
        // content. If the chip still answers RDID, the zeros are real data and the
        // read must succeed - otherwise the check is just a false-positive machine.
        let mut backend = CH341ABackend::with_bus(ZeroDataBus {
            id: [0xef, 0x60, 0x19],
            rdid_next: false,
        });
        let data = backend
            .read_range(0, 128)
            .expect("zeros with a live chip are real data");
        assert_eq!(data, vec![0u8; 128]);
    }

    #[test]
    fn read_refuses_when_chip_id_changes_mid_read() {
        // Contact can degrade into a wrong-but-nonzero id rather than silence.
        // Anything that is not the id identify() anchored on means the bus is no
        // longer trustworthy.
        let mut backend = CH341ABackend::with_bus(ZeroDataBus {
            id: [0xef, 0x60, 0x19],
            rdid_next: false,
        });
        backend.jedec_expect = Some([0xc2, 0x25, 0x39]); // identify saw a Macronix part
        let err = backend.read_range(0, 128).unwrap_err();
        assert!(
            err.to_string().contains("ef6019"),
            "error must report the id actually seen: {err}"
        );
    }

    #[test]
    fn read_retries_a_failed_chunk_before_giving_up() {
        // A wobble should cost one retry, not the whole dump.
        struct FlakyBus {
            fails_left: u32,
        }
        impl UsbBus for FlakyBus {
            fn bulk_write(&mut self, _d: &[u8]) -> Result<()> {
                Ok(())
            }
            fn bulk_read(&mut self, len: usize) -> Result<Vec<u8>> {
                if self.fails_left > 0 {
                    self.fails_left -= 1;
                    return Err(BackendError::Usb(ratchet_usb::UsbError::Timeout));
                }
                Ok(chip_rx(vec![0xa5u8; len]))
            }
        }
        let mut backend = CH341ABackend::with_bus(FlakyBus { fails_left: 1 });
        let data = backend
            .read_range(0, 64)
            .expect("one transient failure must be retried, not fatal");
        assert_eq!(data, vec![0xa5u8; 64]);
    }

    #[test]
    fn progress_callback_reports_read_chunks() {
        // The progress hook must observe monotonically increasing byte counts
        // ending exactly at the requested length — the CLI ticker depends on
        // the final (total, total) call to print its 100% line.
        use std::sync::{Arc, Mutex};
        let mut bus = MockBus::new();
        bus.queue_read(chip_rx(vec![0xa5u8; 8])); // header echo
        for _ in 0..3 {
            bus.queue_read(chip_rx(vec![0xa5u8; 40])); // data chunks (non-zero: see framing test)
        }
        let mut backend = CH341ABackend::with_bus(bus);
        let seen: Arc<Mutex<Vec<(u64, u64)>>> = Arc::new(Mutex::new(Vec::new()));
        let sink = Arc::clone(&seen);
        backend.set_progress_callback(Box::new(move |done, total| {
            sink.lock().unwrap().push((done, total));
        }));
        backend.read_range(0, 64).unwrap();
        let seen = seen.lock().unwrap();
        assert!(!seen.is_empty(), "progress must be reported");
        assert!(seen.windows(2).all(|w| w[0].0 <= w[1].0), "monotonic");
        assert_eq!(
            *seen.last().unwrap(),
            (64, 64),
            "final call is (total, total)"
        );
    }

    #[test]
    fn cs_deasserted_after_midstream_error() {
        // A bus whose reads fail mid-command (USB timeout). The chip must not be
        // left selected: the CS-deassert framing must still go out, or the next
        // command's clocks are interpreted as continuation data by the flash.
        struct FailReadBus {
            writes: Vec<Vec<u8>>,
        }
        impl UsbBus for FailReadBus {
            fn bulk_write(&mut self, d: &[u8]) -> Result<()> {
                self.writes.push(d.to_vec());
                Ok(())
            }
            fn bulk_read(&mut self, _len: usize) -> Result<Vec<u8>> {
                Err(BackendError::Other("usb timeout".into()))
            }
        }

        // spi_command path
        let mut backend = CH341ABackend::with_bus(FailReadBus { writes: Vec::new() });
        backend.spi_command(&[SPI_RDSR, 0]).unwrap_err();
        let writes = &chip_writes(&backend.bus.as_ref().unwrap().writes);
        assert_eq!(
            writes.last().unwrap(),
            &cs_deassert_packet().to_vec(),
            "CS must be deasserted after a mid-command bulk error"
        );

        // read_range path (header echo read fails)
        let mut backend = CH341ABackend::with_bus(FailReadBus { writes: Vec::new() });
        backend.read_range(0, 64).unwrap_err();
        let writes = &chip_writes(&backend.bus.as_ref().unwrap().writes);
        assert_eq!(
            writes.last().unwrap(),
            &cs_deassert_packet().to_vec(),
            "CS must be deasserted after a mid-read bulk error"
        );
    }

    /// A bus that always reports the chip busy (WIP=1) — used to exercise the timeout path.
    struct AlwaysBusyBus;
    impl UsbBus for AlwaysBusyBus {
        fn bulk_write(&mut self, _data: &[u8]) -> Result<()> {
            Ok(())
        }
        fn bulk_read(&mut self, len: usize) -> Result<Vec<u8>> {
            // byte[1] carries the status; WIP bit set — emitted in wire form
            // (bit-reversed) like the real LSB-first shifter delivers it.
            let mut v = vec![0u8; len.max(2)];
            v[1] = SR_WIP.reverse_bits();
            Ok(v)
        }
    }

    #[test]
    fn wait_until_ready_polls_rdsr_until_wip_clears() {
        let mut bus = MockBus::new();
        // Two busy polls (WIP=1) then ready (WIP=0). byte[1] is the status register.
        bus.queue_read(chip_rx(vec![0x00, SR_WIP]));
        bus.queue_read(chip_rx(vec![0x00, SR_WIP]));
        bus.queue_read(chip_rx(vec![0x00, 0x00]));
        let mut backend = CH341ABackend::with_bus(bus);
        backend.wait_until_ready(ERASE_TIMEOUT).unwrap();
        let bus = backend.bus.as_ref().unwrap();
        // Exactly three RDSR stream packets were issued (busy, busy, ready).
        let rdsr_polls = chip_writes(&bus.writes)
            .iter()
            .filter(|w| w.len() >= 2 && w[0] == CMD_SPI_STREAM && w[1] == SPI_RDSR)
            .count();
        assert_eq!(rdsr_polls, 3);
    }

    #[test]
    fn wait_until_ready_times_out_when_chip_never_ready() {
        let mut backend = CH341ABackend::with_bus(AlwaysBusyBus);
        let err = backend
            .wait_until_ready(Duration::from_millis(5))
            .unwrap_err();
        assert!(format!("{err}").contains("busy"));
    }

    /// Index of the first SPI-stream packet whose opcode + 3-byte address match.
    fn find_cmd_at_addr(writes: &[Vec<u8>], opcode: u8, addr3: [u8; 3]) -> Option<usize> {
        writes.iter().position(|w| {
            w.len() >= 5 && w[0] == CMD_SPI_STREAM && w[1] == opcode && w[2..5] == addr3
        })
    }

    #[test]
    fn write_chip_erases_then_page_programs_across_page_boundaries() {
        // 300-byte image → spans two 256-byte pages, so we must see PAGE_PROGRAM at addr 0
        // AND at addr 256 (0x000100). Erase must precede the first program.
        let firmware: Vec<u8> = (0..300u32).map(|i| (i % 251) as u8).collect();
        let path = test_tmp("d2-write.bin");
        std::fs::write(&path, &firmware).unwrap();

        let mut bus = MockBus::new();
        // RDID → Winbond W25Q128 (ef4018), the most common motherboard BIOS chip: 16 MB,
        // 256-byte pages, 4 KB sectors, 3-byte addressing.
        bus.queue_read(chip_rx(vec![0x00, 0xef, 0x40, 0x18]));
        // Every subsequent read is don't-care except RDSR polls, whose byte[1]=0 ⇒ WIP clear.
        for _ in 0..80 {
            bus.queue_read(chip_rx(vec![0u8; 8]));
        }
        let mut backend = CH341ABackend::with_bus(bus);

        let res = backend
            .write_chip(
                &path,
                WriteOpts {
                    skip_backup: true,
                    skip_verify: true,
                },
            )
            .unwrap();
        assert!(res.success);
        assert_eq!(res.backup_path, None); // skip_backup honored
        assert!(!res.verified); // skip_verify honored

        let writes = &chip_writes(&backend.bus.as_ref().unwrap().writes);
        let erase_idx = find_cmd_at_addr(writes, SPI_SECTOR_ERASE, [0, 0, 0])
            .expect("sector-erase at addr 0 must be issued before programming");
        let pp0_idx =
            find_cmd_at_addr(writes, SPI_PAGE_PROGRAM, [0, 0, 0]).expect("page-program at addr 0");
        let pp1_idx = find_cmd_at_addr(writes, SPI_PAGE_PROGRAM, [0x00, 0x01, 0x00])
            .expect("page-program at addr 256 (page boundary split)");
        // Erase before program; first page before second.
        assert!(erase_idx < pp0_idx, "must erase before programming");
        assert!(pp0_idx < pp1_idx, "pages programmed in order");

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn write_chip_rejects_image_larger_than_chip() {
        // Winbond W25Q64 (ef4017) = 8 MB. A 9 MB image must be rejected, not silently truncated.
        let big = vec![0xa5u8; 9 * 1024 * 1024];
        let path = test_tmp("d2-oversize.bin");
        std::fs::write(&path, &big).unwrap();

        let mut bus = MockBus::new();
        bus.queue_read(chip_rx(vec![0x00, 0xef, 0x40, 0x17])); // RDID → W25Q64, 8 MB
        let mut backend = CH341ABackend::with_bus(bus);
        let err = backend
            .write_chip(
                &path,
                WriteOpts {
                    skip_backup: true,
                    skip_verify: true,
                },
            )
            .unwrap_err();
        assert!(format!("{err}").contains("chip holds only"));
        let _ = std::fs::remove_file(&path);
    }

    /// A test bus that emulates a real SPI NOR flash behind the CH341A USB framing, so a full
    /// write_chip → read-back → verify_chip cycle runs without hardware. It accumulates the SPI
    /// bytes of each CS-low frame, answers reads full-duplex (response byte i depends on the
    /// command bytes already in the frame), and applies erase/program side-effects on CS-high.
    /// PAGE_PROGRAM uses real AND-into-flash semantics, so a missing erase-before-write would
    /// leave stale 0-bits and fail verification — exactly like silicon.
    struct LoopbackFlash {
        flash: Vec<u8>,
        jedec: [u8; 3],
        frame: Vec<u8>,
        read_pos: usize,
        /// EN4B (0xB7) state, like real silicon: while set, mode-dependent
        /// opcodes (0x03/0x02/0x20) carry 4 address bytes.
        four_byte: bool,
        /// Write-enable latch (set by WREN 0x06).
        wel: bool,
        /// Micron-like gating: when true, EN4B/EX4B are honored only if WEL is
        /// set, exactly as Micron N25Q/MT25Q behave. A driver that omits the
        /// WREN before B7h then never enters 4-byte mode and misframes reads.
        strict_en4b: bool,
        /// SFDP image returned for 0x5A reads. Empty ⇒ the part exposes no SFDP
        /// table (reads answer 0xff, so discovery finds no valid signature).
        sfdp: Vec<u8>,
        /// Ordered log of (opcode, address) for erase/program, so tests can assert
        /// not just the final bytes but the SEQUENCE — specifically that an erase
        /// never runs far ahead of the program that refills it.
        ops: Vec<(u8, usize)>,
        /// Model a probe that loses contact partway: a READ at or past this offset
        /// returns 0x00 and latches `contact_lost`, after which RDID goes silent
        /// too. That is the real signature — zeros on the data lines AND a chip
        /// that stops answering — and it is what read_chunk_checked keys off.
        dead_from: Option<usize>,
        contact_lost: std::cell::Cell<bool>,
    }
    impl LoopbackFlash {
        fn new(size: usize, jedec: [u8; 3]) -> Self {
            Self {
                flash: vec![0xff; size],
                jedec,
                frame: Vec::new(),
                read_pos: 0,
                four_byte: false,
                wel: false,
                strict_en4b: false,
                sfdp: Vec::new(),
                ops: Vec::new(),
                dead_from: None,
                contact_lost: std::cell::Cell::new(false),
            }
        }
        /// Lose contact at `offset`, as a marginally clamped probe does in practice.
        fn losing_contact_at(mut self, offset: usize) -> Self {
            self.dead_from = Some(offset);
            self
        }
        /// Model a Micron-family part that ignores EN4B/EX4B unless WREN preceded it.
        fn micron_like(mut self) -> Self {
            self.strict_en4b = true;
            self
        }
        /// Attach an SFDP image so 0x5A reads return its bytes — models a chip
        /// whose geometry is discoverable via SFDP even when its JEDEC id is
        /// absent from the chip DB.
        fn with_sfdp(mut self, sfdp: Vec<u8>) -> Self {
            self.sfdp = sfdp;
            self
        }
        fn decode_addr(bytes: &[u8]) -> usize {
            bytes.iter().fold(0usize, |acc, &b| (acc << 8) | b as usize)
        }
        /// Address length for an opcode given the current EN4B state — mirrors
        /// datasheet behavior: dedicated 4B opcodes always take 4 bytes,
        /// classic opcodes take 4 only while EN4B is active.
        fn addr_len(&self, op: u8) -> usize {
            match op {
                SPI_READ_4B | SPI_PAGE_PROGRAM_4B | SPI_SECTOR_ERASE_4B | SPI_BLOCK_ERASE_4B => 4,
                _ if self.four_byte => 4,
                _ => 3,
            }
        }
        /// Full-duplex response for absolute frame position `pos`, given `self.frame` so far.
        fn response_byte(&self, pos: usize) -> u8 {
            if self.frame.is_empty() {
                return 0;
            }
            match self.frame[0] {
                // Once contact is gone the chip cannot answer an id request either.
                // This is the discriminator read_chunk_checked relies on to tell a
                // dropout apart from legitimately-zero firmware content.
                SPI_RDID if self.contact_lost.get() => 0,
                SPI_RDID => {
                    if (1..=3).contains(&pos) {
                        self.jedec[pos - 1]
                    } else {
                        0
                    }
                }
                SPI_RDSR | SPI_RDSR2 | SPI_RDSR3 => 0, // WIP clear
                op @ (SPI_READ | SPI_READ_4B) => {
                    let addr_len = self.addr_len(op);
                    let data_start = 1 + addr_len;
                    if pos >= data_start && self.frame.len() >= data_start {
                        let base = Self::decode_addr(&self.frame[1..data_start]);
                        let a = base + (pos - data_start);
                        if self.dead_from.is_some_and(|d| a >= d) {
                            self.contact_lost.set(true);
                            return 0x00;
                        }
                        *self.flash.get(a).unwrap_or(&0xff)
                    } else {
                        0
                    }
                }
                SPI_SFDP => {
                    // 0x5A + 3 SFDP-space address bytes + 1 dummy, then data.
                    let data_start = 5;
                    if pos >= data_start && self.frame.len() >= 4 {
                        let base = Self::decode_addr(&self.frame[1..4]);
                        *self.sfdp.get(base + (pos - data_start)).unwrap_or(&0xff)
                    } else {
                        0
                    }
                }
                _ => 0,
            }
        }
        /// Apply erase/program effects when the CS frame closes.
        fn commit_frame(&mut self) {
            if self.frame.is_empty() {
                return;
            }
            match self.frame[0] {
                SPI_CHIP_ERASE => self.flash.iter_mut().for_each(|b| *b = 0xff),
                SPI_WREN => self.wel = true,
                SPI_EN4B => {
                    if !self.strict_en4b || self.wel {
                        self.four_byte = true;
                    }
                    self.wel = false;
                }
                SPI_EX4B => {
                    if !self.strict_en4b || self.wel {
                        self.four_byte = false;
                    }
                    self.wel = false;
                }
                op @ (SPI_SECTOR_ERASE | SPI_SECTOR_ERASE_4B) => {
                    let al = self.addr_len(op);
                    let a = Self::decode_addr(&self.frame[1..1 + al]);
                    self.ops.push((SPI_SECTOR_ERASE, a));
                    for b in self.flash.iter_mut().skip(a).take(4096) {
                        *b = 0xff;
                    }
                }
                // 64 KB block erase (0xD8 / 0xDC). write_chip issues this as its PRIMARY
                // erase opcode, so a fake that ignores it would leave stale data that the
                // program step ANDs into — every end-to-end write test would be a lie.
                op @ (SPI_BLOCK_ERASE | SPI_BLOCK_ERASE_4B) => {
                    let al = self.addr_len(op);
                    let a = Self::decode_addr(&self.frame[1..1 + al]);
                    self.ops.push((SPI_BLOCK_ERASE, a));
                    for b in self.flash.iter_mut().skip(a).take(BLOCK_64K as usize) {
                        *b = 0xff;
                    }
                }
                op @ (SPI_PAGE_PROGRAM | SPI_PAGE_PROGRAM_4B) => {
                    let al = self.addr_len(op);
                    let a = Self::decode_addr(&self.frame[1..1 + al]);
                    self.ops.push((SPI_PAGE_PROGRAM, a));
                    for (i, &d) in self.frame[1 + al..].iter().enumerate() {
                        if let Some(cell) = self.flash.get_mut(a + i) {
                            *cell &= d; // program can only clear bits — faithful to NOR flash
                        }
                    }
                }
                _ => {}
            }
            self.frame.clear();
            self.read_pos = 0;
        }
    }
    impl UsbBus for LoopbackFlash {
        fn bulk_write(&mut self, data: &[u8]) -> Result<()> {
            match data.first().copied() {
                Some(CMD_UIO_STREAM) => {
                    // CS bit clear ⇒ CS-low (frame start); CS bit set ⇒ CS-high (frame commit).
                    if data.get(1).map(|b| b & STM_SPI_CS == 0).unwrap_or(false) {
                        self.frame.clear();
                        self.read_pos = 0;
                    } else {
                        self.commit_frame();
                    }
                }
                Some(CMD_SPI_STREAM) => {
                    // Wire bytes arrive LSB-first (driver pre-reversed them);
                    // decode the frame in chip-semantic MSB order.
                    let mut payload = data[1..].to_vec();
                    reverse_bits_in_place(&mut payload);
                    self.frame.extend_from_slice(&payload);
                }
                _ => {}
            }
            Ok(())
        }
        fn bulk_read(&mut self, len: usize) -> Result<Vec<u8>> {
            let mut out: Vec<u8> = (0..len)
                .map(|j| self.response_byte(self.read_pos + j))
                .collect();
            self.read_pos += len;
            // Chip answers MSB-first; the CH341A shifter hands them to the host
            // LSB-first — emit wire form, the driver reverses back.
            reverse_bits_in_place(&mut out);
            Ok(out)
        }
    }

    // W25Q256JW-class part (ef6019, 32 MB): identify auto-sends EN4B, then the
    // classic 0x03 read must carry FOUR address bytes. LoopbackFlash tracks
    // EN4B like silicon, so if the driver ever frames 3-byte addresses on a
    // >16 MB chip (or never enters 4-byte mode), every marker below lands at
    // the wrong offset and this test fails — this is the regression net for
    // the exact read path a 32 MB BIOS dump takes.
    #[test]
    fn read_32mb_chip_crosses_16mb_boundary_correctly() {
        const SIZE_32MB: usize = 32 * 1024 * 1024;
        let mut bus = LoopbackFlash::new(SIZE_32MB, [0xef, 0x60, 0x19]);
        bus.flash[0] = 0xa5;
        // Distinct bytes straddling the 16 MB line: 3-byte addressing cannot
        // even express offsets past 0x00FF_FFFF.
        let boundary = 16 * 1024 * 1024;
        let markers: [u8; 6] = [0x11, 0x22, 0x33, 0x44, 0x55, 0x66];
        for (i, m) in markers.iter().enumerate() {
            bus.flash[boundary - 3 + i] = *m;
        }
        bus.flash[SIZE_32MB - 1] = 0x5a;

        let mut backend = CH341ABackend::with_bus(bus);
        let path = test_tmp("d4-32mb-read.bin");
        let r = backend.read_chip(&path).unwrap();
        assert!(r.success);
        assert_eq!(r.size_bytes as usize, SIZE_32MB);

        let dump = std::fs::read(&path).unwrap();
        assert_eq!(dump.len(), SIZE_32MB);
        assert_eq!(dump[0], 0xa5);
        assert_eq!(&dump[boundary - 3..boundary + 3], &markers);
        assert_eq!(dump[SIZE_32MB - 1], 0x5a, "top byte of the 32 MB range");
        let _ = std::fs::remove_file(&path);
    }

    // Same 32 MB read, but the emulated part gates EN4B on WREN like a Micron
    // N25Q/MT25Q. If enter_4byte_mode omits the WREN before B7h, the strict
    // part stays in 3-byte mode, the 0x03 read frames a 3-byte address, and the
    // >16 MB markers land at the wrong offset — so this test fails closed on a
    // regression of the WREN-before-EN4B fix.
    #[test]
    fn read_32mb_micron_gated_en4b_needs_wren() {
        const SIZE_32MB: usize = 32 * 1024 * 1024;
        let mut bus = LoopbackFlash::new(SIZE_32MB, [0xef, 0x60, 0x19]).micron_like();
        let boundary = 16 * 1024 * 1024;
        let markers: [u8; 6] = [0x9a, 0x8b, 0x7c, 0x6d, 0x5e, 0x4f];
        for (i, m) in markers.iter().enumerate() {
            bus.flash[boundary - 3 + i] = *m;
        }
        bus.flash[SIZE_32MB - 1] = 0xc3;

        let mut backend = CH341ABackend::with_bus(bus);
        let path = test_tmp("d5-32mb-micron.bin");
        let r = backend.read_chip(&path).unwrap();
        assert!(r.success);
        let dump = std::fs::read(&path).unwrap();
        assert_eq!(
            &dump[boundary - 3..boundary + 3],
            &markers,
            "WREN-gated part only enters 4-byte mode if WREN preceded EN4B"
        );
        assert_eq!(dump[SIZE_32MB - 1], 0xc3, "top byte of the 32 MB range");
        let _ = std::fs::remove_file(&path);
    }

    // The read-resume property, end to end, against the exact failure seen on real
    // hardware: probe holds for a couple of chunks, then contact drops, reads go to
    // 0x00 and the chip stops answering RDID.
    //
    // This is the difference between "no backup at all" and "a backup". A 32 MB read
    // needs minutes of contact; a marginal probe gives tens of seconds. Without resume
    // those numbers have to meet. With it, short attempts accumulate.
    #[test]
    fn read_resumes_from_saved_progress_after_contact_drops() {
        // SIZE must be the chip DB's size for this JEDEC id (ef4018 = W25Q128, 16 MB):
        // read_chip trusts identify_chip, not the fake's buffer length.
        const SIZE: usize = 16 * 1024 * 1024;
        let content: Vec<u8> = (0..SIZE).map(|i| (i % 251) as u8 | 1).collect();
        let path = test_tmp("resume-read.bin");
        std::fs::remove_file(&path).ok();
        super::super::resume::ResumeState::clear(&path);

        // Attempt 1: dies partway through the third chunk.
        let mut bus = LoopbackFlash::new(SIZE, [0xef, 0x40, 0x18]).losing_contact_at(150_000);
        bus.flash.copy_from_slice(&content);
        let mut backend = CH341ABackend::with_bus(bus);
        let err = backend.read_chip(&path).unwrap_err().to_string();
        assert!(
            err.contains("Progress saved"),
            "a failed read must report what it kept, got: {err}"
        );

        // The kept chunks must be on disk, and the sidecar must exist.
        let sidecar = super::super::resume::resume_path(&path);
        assert!(sidecar.exists(), "sidecar must survive the failure");
        let partial = std::fs::read(&path).unwrap();
        assert_eq!(partial.len(), SIZE, "partial is preallocated to full size");
        assert!(
            partial[..128 * 1024] == content[..128 * 1024],
            "the two chunks that completed before the drop must be real data"
        );

        // Attempt 2: probe re-seated (healthy bus), same command, same path.
        let mut bus2 = LoopbackFlash::new(SIZE, [0xef, 0x40, 0x18]);
        bus2.flash.copy_from_slice(&content);
        let mut backend2 = CH341ABackend::with_bus(bus2);
        let r = backend2.read_chip(&path).unwrap();
        assert!(r.success);
        // Compare with assert!, not assert_eq!: a failing assert_eq! on 16 MB vectors
        // dumps both of them into the test log.
        assert!(
            std::fs::read(&path).unwrap() == content,
            "resumed read must produce the whole chip, byte for byte"
        );
        assert!(
            !sidecar.exists(),
            "a completed read must clear the sidecar, or the next read looks half-done"
        );
        std::fs::remove_file(&path).ok();
    }

    // A sidecar from a DIFFERENT chip must never be honoured: resuming across chips
    // would splice two dumps into one file that looks like a valid backup.
    #[test]
    fn read_ignores_resume_progress_from_a_different_chip() {
        const SIZE: usize = 16 * 1024 * 1024; // ef4018 = W25Q128
        let path = test_tmp("resume-wrong-chip.bin");
        std::fs::remove_file(&path).ok();

        // Claim chunk 0 of some OTHER part is already done, and back it with a file
        // so the "partial must exist" guard cannot be what rejects it.
        let mut stale = super::super::resume::ResumeState::fresh("aabbcc", SIZE as u64, 65536);
        stale.done[0] = true;
        std::fs::write(&path, vec![0x11u8; SIZE]).unwrap();
        stale.save(&path).unwrap();

        let content: Vec<u8> = (0..SIZE).map(|i| (i % 241) as u8 | 1).collect();
        let mut bus = LoopbackFlash::new(SIZE, [0xef, 0x40, 0x18]); // ef4018, not aabbcc
        bus.flash.copy_from_slice(&content);
        let mut backend = CH341ABackend::with_bus(bus);
        backend.read_chip(&path).unwrap();
        assert!(
            std::fs::read(&path).unwrap() == content,
            "stale sidecar from another chip must be ignored and every chunk re-read"
        );
        std::fs::remove_file(&path).ok();
    }

    // The blank-window property. Erasing the WHOLE chip and then programming it (the
    // obvious structure, and what this code used to do) leaves every byte at 0xFF for
    // the entire programming pass: lose the probe in that window and the board has no
    // BIOS at all and no way to boot to fix itself. Per-block, only the block being
    // programmed is ever blank. Asserting on the final bytes cannot catch a regression
    // here -- both orderings end with the same chip contents -- so assert the SEQUENCE.
    #[test]
    fn write_chip_erases_only_the_block_it_is_about_to_program() {
        const SIZE: usize = 512 * 1024; // 8 blocks
                                        // |1 keeps every page non-blank, so each block really does get programmed.
        let firmware: Vec<u8> = (0..SIZE).map(|i| (i % 251) as u8 | 1).collect();
        let path = test_tmp("blank-window.bin");
        std::fs::write(&path, &firmware).unwrap();

        let bus = LoopbackFlash::new(SIZE, [0xef, 0x40, 0x18]);
        let mut backend = CH341ABackend::with_bus(bus);
        backend
            .write_chip(
                &path,
                WriteOpts {
                    skip_backup: true,
                    skip_verify: false,
                },
            )
            .unwrap();

        let ops = &backend.bus.as_ref().unwrap().ops;
        let first_program = ops
            .iter()
            .position(|(op, _)| *op == SPI_PAGE_PROGRAM)
            .expect("something must be programmed");
        let erases_before_first_program = ops[..first_program]
            .iter()
            .filter(|(op, _)| *op == SPI_BLOCK_ERASE)
            .count();
        assert_eq!(
            erases_before_first_program, 1,
            "only the block about to be programmed may be erased; erasing all 8 up front \
             would leave the whole chip blank for the entire program pass"
        );

        // And no erase may run while an earlier block is still blank.
        let mut blank: Option<usize> = None;
        for (op, addr) in ops {
            match *op {
                SPI_BLOCK_ERASE => {
                    assert!(
                        blank.is_none(),
                        "erased {addr:#x} while {:#x?} was still blank",
                        blank
                    );
                    blank = Some(*addr);
                }
                // The block is being refilled, so it is no longer blank.
                SPI_PAGE_PROGRAM
                    if blank.is_some_and(|b| *addr >= b && *addr < b + BLOCK_64K as usize) =>
                {
                    blank = None;
                }
                _ => {}
            }
        }
        assert_eq!(
            backend.bus.as_ref().unwrap().flash,
            firmware,
            "chip must still end up matching the image"
        );
        std::fs::remove_file(&path).ok();
    }

    // The resume property. A write that lost the probe part-way must be continuable by
    // simply re-running it: blocks already holding the target bytes are skipped, so the
    // chip itself is the progress record and there is no sidecar state to go stale.
    #[test]
    fn write_chip_skips_blocks_that_already_hold_the_target_image() {
        const SIZE: usize = 1024 * 1024; // 16 blocks
        let firmware: Vec<u8> = (0..SIZE).map(|i| (i % 251) as u8 | 1).collect();
        let path = test_tmp("resume-skip.bin");
        std::fs::write(&path, &firmware).unwrap();

        let mut bus = LoopbackFlash::new(SIZE, [0xef, 0x40, 0x18]);
        // Model an earlier write that finished blocks 0..3, then lost contact.
        let done = 3 * BLOCK_64K as usize;
        bus.flash[..done].copy_from_slice(&firmware[..done]);

        let mut backend = CH341ABackend::with_bus(bus);
        let w = backend
            .write_chip(
                &path,
                WriteOpts {
                    skip_backup: false, // backup read doubles as the baseline
                    skip_verify: false,
                },
            )
            .unwrap();
        assert!(w.verified);

        let erased: Vec<usize> = backend
            .bus
            .as_ref()
            .unwrap()
            .ops
            .iter()
            .filter(|(op, _)| *op == SPI_BLOCK_ERASE)
            .map(|(_, a)| *a)
            .collect();
        for b in 0..3 {
            assert!(
                !erased.contains(&(b * BLOCK_64K as usize)),
                "block {b} already held the image and must NOT be re-erased (erased: {erased:x?})"
            );
        }
        for b in 3..16 {
            assert!(
                erased.contains(&(b * BLOCK_64K as usize)),
                "block {b} differs from the image and must be erased (erased: {erased:x?})"
            );
        }
        assert_eq!(
            backend.bus.as_ref().unwrap().flash,
            firmware,
            "resumed write must still leave the whole chip matching the image"
        );
        if let Some(bp) = w.backup_path {
            std::fs::remove_file(bp).ok();
        }
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn write_then_verify_round_trip_via_loopback_flash() {
        // Emulate a W25Q128 (ef4018). Image spans 2 sectors + 17 pages to exercise boundaries.
        let firmware: Vec<u8> = (0..(4096u32 + 100)).map(|i| (i % 251) as u8).collect();
        let path = test_tmp("d3-roundtrip.bin");
        std::fs::write(&path, &firmware).unwrap();

        let bus = LoopbackFlash::new(16 * 1024 * 1024, [0xef, 0x40, 0x18]);
        let mut backend = CH341ABackend::with_bus(bus);

        // Default-ish opts but skip the (16 MB) backup read to keep the test quick; DO verify.
        let w = backend
            .write_chip(
                &path,
                WriteOpts {
                    skip_backup: true,
                    skip_verify: false,
                },
            )
            .unwrap();
        assert!(w.success);
        assert!(
            w.verified,
            "read-back verify after a real program cycle must match"
        );

        // Independent verify call against the same image also matches.
        let v = backend.verify_chip(&path).unwrap();
        assert!(v.matches);
        assert_eq!(v.chip_checksum, v.file_checksum);

        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn verify_chip_detects_mismatch_via_loopback() {
        let firmware: Vec<u8> = (0..1000u32).map(|i| (i % 251) as u8).collect();
        let written = test_tmp("d3-written.bin");
        let other = test_tmp("d3-other.bin");
        std::fs::write(&written, &firmware).unwrap();
        std::fs::write(&other, vec![0x5au8; 1000]).unwrap();

        let bus = LoopbackFlash::new(16 * 1024 * 1024, [0xef, 0x40, 0x18]);
        let mut backend = CH341ABackend::with_bus(bus);
        backend
            .write_chip(
                &written,
                WriteOpts {
                    skip_backup: true,
                    skip_verify: true,
                },
            )
            .unwrap();

        // The chip now holds `firmware`; verifying a different file must NOT match.
        let v = backend.verify_chip(&other).unwrap();
        assert!(!v.matches, "verify must detect a chip≠file mismatch");
        // And verifying the real image matches.
        assert!(backend.verify_chip(&written).unwrap().matches);

        std::fs::remove_file(&written).ok();
        std::fs::remove_file(&other).ok();
    }

    #[test]
    fn identify_large_chip_sends_en4b_and_enables_4byte() {
        // W25Q256 (ef4019) = 32 MB → must enter 4-byte mode (EN4B 0xb7) so >16 MB is addressable.
        let mut bus = MockBus::new();
        bus.queue_read(chip_rx(vec![0x00, 0xef, 0x40, 0x19]));
        for _ in 0..4 {
            bus.queue_read(chip_rx(vec![0u8; 8])); // EN4B command's reads (don't-care)
        }
        let mut backend = CH341ABackend::with_bus(bus);
        let info = backend.identify_chip().unwrap().unwrap();
        assert!(info.size_bytes > SIZE_16MB);
        assert!(backend.use_4byte_addr, "4-byte addressing flag must be set");
        let writes = &chip_writes(&backend.bus.as_ref().unwrap().writes);
        assert!(
            writes
                .iter()
                .any(|w| w.len() >= 2 && w[0] == CMD_SPI_STREAM && w[1] == SPI_EN4B),
            "EN4B (0xb7) must be sent when identifying a >16 MB chip"
        );
    }

    #[test]
    fn identify_small_chip_does_not_send_en4b() {
        // W25Q128 (ef4018) = 16 MB → stays in 3-byte mode, no EN4B.
        let mut bus = MockBus::new();
        bus.queue_read(chip_rx(vec![0x00, 0xef, 0x40, 0x18]));
        let mut backend = CH341ABackend::with_bus(bus);
        backend.identify_chip().unwrap();
        assert!(!backend.use_4byte_addr);
        let writes = &chip_writes(&backend.bus.as_ref().unwrap().writes);
        assert!(
            !writes
                .iter()
                .any(|w| w.len() >= 2 && w[0] == CMD_SPI_STREAM && w[1] == SPI_EN4B),
            "EN4B must NOT be sent for a ≤16 MB chip"
        );
    }

    #[test]
    fn read_range_streams_single_opcode() {
        // 3 KiB read: the READ opcode + address must be issued exactly ONCE,
        // inside exactly one CS assertion — never re-addressed per KiB.
        let mut bus = MockBus::new();
        for _ in 0..120 {
            // Non-zero filler: an all-0x00 range is the dead-bus signature and would
            // (correctly) trip the contact check. This test is about framing.
            bus.queue_read(chip_rx(vec![0xa5u8; 40])); // header echo + 31-byte data chunks
        }
        let mut backend = CH341ABackend::with_bus(bus);
        let data = backend.read_range(0, 3 * 1024).unwrap();
        assert_eq!(data.len(), 3 * 1024);
        let writes = &chip_writes(&backend.bus.as_ref().unwrap().writes);
        let read_opcodes = writes
            .iter()
            .filter(|w| w.len() >= 2 && w[0] == CMD_SPI_STREAM && w[1] == SPI_READ)
            .count();
        assert_eq!(read_opcodes, 1, "READ (0x03) must go out once per range");
        let rdids = writes
            .iter()
            .filter(|w| w.len() >= 2 && w[0] == CMD_SPI_STREAM && w[1] == SPI_RDID)
            .count();
        assert_eq!(
            rdids, 1,
            "exactly one liveness RDID after the chunk — contact is re-checked per \
             chunk, not per KiB"
        );
        let cs_asserts = writes
            .iter()
            .filter(|w| w.as_slice() == cs_assert_packet())
            .count();
        let cs_deasserts = writes
            .iter()
            .filter(|w| w.as_slice() == cs_deassert_packet())
            .count();
        assert_eq!(
            (cs_asserts, cs_deasserts),
            (2, 2),
            "one CS pulse for the range's READ, one for the liveness RDID — the READ \
             must never be re-addressed per KiB"
        );
    }

    #[test]
    fn read_sfdp_parses_real_header_and_density() {
        use crate::sfdp::{build_synthetic_sfdp, BuildSfdpOptions};
        let sfdp_space = build_synthetic_sfdp(&BuildSfdpOptions::default());
        let mut bus = MockBus::new();
        // Header read: tx = 5 (cmd+addr+dummy) + 16 = 21 bytes, single chunk →
        // one bulk_read(21) whose data sits at [5..21].
        let mut rx1 = vec![0u8; 5];
        rx1.extend_from_slice(&sfdp_space[..16]);
        bus.queue_read(chip_rx(rx1));
        // BFPT read at 0x80 (20 dwords = 80 bytes): tx = 85 bytes → CH341A chunks
        // of 31 + 31 + 23, each answered by one queued bulk_read.
        let mut rx2 = vec![0u8; 5];
        rx2.extend_from_slice(&sfdp_space[0x80..0x80 + 80]);
        bus.queue_read(chip_rx(rx2[..31].to_vec()));
        bus.queue_read(chip_rx(rx2[31..62].to_vec()));
        bus.queue_read(chip_rx(rx2[62..85].to_vec()));
        let mut backend = CH341ABackend::with_bus(bus);
        let info = backend.read_sfdp().unwrap().expect("SFDP present");
        // Real density parsed from the BFPT — never the fabricated zeros.
        assert_eq!(info.density_bytes, 8 * 1024 * 1024);
        assert_eq!(info.density_bits, 8 * 1024 * 1024 * 8);
        assert_eq!(info.page_size, 256);
        assert!(info.sector_size_4kb);
        assert!(!info.supports_4byte_addr);
        // Wire bytes: 0x5a + 3-byte address 0 + dummy.
        let writes = &chip_writes(&backend.bus.as_ref().unwrap().writes);
        let first_sfdp = writes
            .iter()
            .find(|w| w.len() >= 6 && w[0] == CMD_SPI_STREAM && w[1] == SPI_SFDP)
            .expect("an SFDP (0x5a) frame must be issued");
        assert_eq!(&first_sfdp[2..6], &[0, 0, 0, 0]);
    }

    #[test]
    fn read_sfdp_returns_none_without_valid_signature() {
        let mut bus = MockBus::new();
        bus.queue_read(chip_rx(vec![0u8; 21])); // zeros — no "SFDP" signature
        let mut backend = CH341ABackend::with_bus(bus);
        assert!(backend.read_sfdp().unwrap().is_none());
    }

    // A chip whose JEDEC id is valid but not in the 806-entry DB must still be
    // identified and sized from its SFDP table — the exact case where a bare
    // JEDEC lookup would give up but AsProgrammer/flashrom read the part anyway.
    #[test]
    fn identify_unlisted_jedec_reads_geometry_from_sfdp() {
        use crate::sfdp::{build_synthetic_sfdp, BuildSfdpOptions};
        let jedec = [0xab, 0xcd, 0x18];
        assert!(
            lookup_by_jedec_id("abcd18").is_none(),
            "test precondition: abcd18 must be absent from the chip DB"
        );
        let sfdp_space = build_synthetic_sfdp(&BuildSfdpOptions::default()); // 8 MB, 4KB sectors
        let bus = LoopbackFlash::new(1024, jedec).with_sfdp(sfdp_space);
        let mut backend = CH341ABackend::with_bus(bus);

        let info = backend
            .identify_chip()
            .unwrap()
            .expect("an unlisted-but-SFDP-compliant chip must still identify");
        assert_eq!(info.jedec_id, "abcd18");
        assert_eq!(
            info.size_bytes,
            8 * 1024 * 1024,
            "size must come from the SFDP density, not a fabricated default"
        );
        assert!(
            info.name.contains("via SFDP"),
            "identity must be marked SFDP-sourced: {}",
            info.name
        );
        assert_eq!(info.page_size, Some(256));
        assert_eq!(info.sector_size, Some(4096));
    }

    // The capability that actually matters: a full read of an unlisted chip now
    // succeeds end-to-end because identify sizes it from SFDP instead of failing
    // with size 0 (which read_chip_to_file rejects as ChipNotDetected).
    #[test]
    fn read_unlisted_sfdp_chip_succeeds_end_to_end() {
        use crate::sfdp::{build_synthetic_sfdp, BuildSfdpOptions};
        const SIZE_8MB: usize = 8 * 1024 * 1024;
        let jedec = [0xab, 0xcd, 0x18];
        assert!(lookup_by_jedec_id("abcd18").is_none());
        let sfdp_space = build_synthetic_sfdp(&BuildSfdpOptions::default()); // 8 MB
        let mut bus = LoopbackFlash::new(SIZE_8MB, jedec).with_sfdp(sfdp_space);
        bus.flash[0] = 0xa5;
        bus.flash[SIZE_8MB - 1] = 0x5a;
        let mut backend = CH341ABackend::with_bus(bus);
        let path = test_tmp("sfdp-unlisted-read.bin");
        let r = backend.read_chip(&path).unwrap();
        assert!(r.success);
        assert_eq!(r.size_bytes as usize, SIZE_8MB);
        let dump = std::fs::read(&path).unwrap();
        assert_eq!(dump[0], 0xa5);
        assert_eq!(dump[SIZE_8MB - 1], 0x5a, "top byte of the SFDP-sized range");
        std::fs::remove_file(&path).ok();
    }

    // No SFDP table ⇒ identify stays honest: a valid id still identifies, but
    // size remains 0 (Unknown) rather than inventing geometry. A later read then
    // fails closed instead of dumping a wrongly-sized image.
    #[test]
    fn identify_unlisted_jedec_without_sfdp_stays_unknown_size_zero() {
        let jedec = [0xab, 0xcd, 0x18];
        assert!(lookup_by_jedec_id("abcd18").is_none());
        let bus = LoopbackFlash::new(1024, jedec); // no .with_sfdp → 0xff on 0x5A
        let mut backend = CH341ABackend::with_bus(bus);
        let info = backend
            .identify_chip()
            .unwrap()
            .expect("a valid id still identifies even without SFDP");
        assert_eq!(info.jedec_id, "abcd18");
        assert_eq!(
            info.size_bytes, 0,
            "no SFDP ⇒ honest unknown size, never a fabricated one"
        );
        assert!(info.name.starts_with("Unknown"));
        assert!(!info.name.contains("via SFDP"));
    }

    #[test]
    fn write_chip_refuses_blank_all_ff_image() {
        // Flashing an all-0xFF (blank) image would wipe a working BIOS — must be refused.
        let path = test_tmp("blank-ff.bin");
        std::fs::write(&path, vec![0xffu8; 4096]).unwrap();
        let mut backend = CH341ABackend::with_bus(MockBus::new());
        let err = backend
            .write_chip(
                &path,
                WriteOpts {
                    skip_backup: true,
                    skip_verify: true,
                },
            )
            .unwrap_err();
        assert!(format!("{err}").contains("blank"));
        std::fs::remove_file(&path).ok();
    }
}
