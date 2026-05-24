// BIOS / firmware analysis. Ports src/analysis/*.ts.
// D9 wires up the bios analyzer; D10/D11 fill in the rest.

pub mod bios;
pub mod me;
pub mod nvram;
pub mod recovery;
pub mod regions;
pub mod repair;
pub mod uefi;
