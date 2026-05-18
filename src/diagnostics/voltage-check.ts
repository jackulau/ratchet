export interface VoltageRail {
  name: string;
  pin: string;
  expected: string;
  tolerance: string;
  color: string;
  notes: string;
}

export interface VoltageReference {
  connector: string;
  description: string;
  rails: VoltageRail[];
}

export const ATX_24PIN: VoltageReference = {
  connector: "ATX 24-pin",
  description: "Main motherboard power connector",
  rails: [
    { name: "+3.3V", pin: "1, 2, 12, 13", expected: "3.3V", tolerance: "±5% (3.135-3.465V)", color: "Orange", notes: "Chipset, RAM, some ICs" },
    { name: "+5V", pin: "4, 6, 21, 22, 23", expected: "5.0V", tolerance: "±5% (4.75-5.25V)", color: "Red", notes: "USB, SATA, legacy devices" },
    { name: "+12V", pin: "10, 11", expected: "12.0V", tolerance: "±5% (11.4-12.6V)", color: "Yellow", notes: "CPU VRM, GPU, fans, drives" },
    { name: "-12V", pin: "14", expected: "-12.0V", tolerance: "±10% (-10.8 to -13.2V)", color: "Blue", notes: "Legacy serial ports (rarely used)" },
    { name: "+5VSB", pin: "9", expected: "5.0V", tolerance: "±5% (4.75-5.25V)", color: "Purple", notes: "Standby power — always on when PSU plugged in" },
    { name: "PS_ON", pin: "16", expected: "5V (off) / <1V (on)", tolerance: "—", color: "Green", notes: "Pull low to turn on PSU (power button signal)" },
    { name: "PWR_OK", pin: "8", expected: "5V when PSU stable", tolerance: "—", color: "Gray", notes: "High = all voltages stable. Low = fault or starting up" },
    { name: "GND", pin: "3,5,7,15,17,18,19,24", expected: "0V", tolerance: "—", color: "Black", notes: "Ground reference — measure all voltages relative to these" },
  ],
};

export const EPS_8PIN: VoltageReference = {
  connector: "EPS 8-pin (CPU)",
  description: "CPU supplementary power — feeds the VRM that generates Vcore",
  rails: [
    { name: "+12V", pin: "1, 2, 3, 4", expected: "12.0V", tolerance: "±5% (11.4-12.6V)", color: "Yellow", notes: "Main CPU power input" },
    { name: "GND", pin: "5, 6, 7, 8", expected: "0V", tolerance: "—", color: "Black", notes: "Ground" },
  ],
};

export const PCIE_6PIN: VoltageReference = {
  connector: "PCIe 6-pin (GPU)",
  description: "GPU supplementary power — 75W max",
  rails: [
    { name: "+12V", pin: "1, 2, 3", expected: "12.0V", tolerance: "±5%", color: "Yellow", notes: "GPU power" },
    { name: "GND", pin: "4, 5, 6", expected: "0V", tolerance: "—", color: "Black", notes: "Ground" },
  ],
};

export const BOARD_TEST_POINTS: VoltageReference = {
  connector: "Common Board Voltages",
  description: "Typical motherboard voltage test points (measure at capacitors near the component)",
  rails: [
    { name: "Vcore", pin: "CPU VRM output caps", expected: "0.7-1.4V", tolerance: "Varies by load/CPU", color: "—", notes: "CPU core voltage — check near CPU socket at VRM output capacitors" },
    { name: "VDDQ (DDR4)", pin: "DIMM slot pins", expected: "1.2V", tolerance: "±5%", color: "—", notes: "DDR4 memory voltage" },
    { name: "VDDQ (DDR5)", pin: "DIMM PMIC", expected: "1.1V", tolerance: "±5%", color: "—", notes: "DDR5 — regulated by PMIC on each DIMM" },
    { name: "VPP", pin: "Near DIMM slots", expected: "2.5V (DDR4)", tolerance: "±5%", color: "—", notes: "DRAM activation voltage" },
    { name: "PCH Core", pin: "Near PCH chip", expected: "1.05V", tolerance: "±5%", color: "—", notes: "Platform Controller Hub core voltage" },
    { name: "PCH I/O", pin: "Near PCH chip", expected: "1.8V", tolerance: "±5%", color: "—", notes: "PCH I/O voltage" },
    { name: "SPI Flash VCC", pin: "BIOS chip pin 8", expected: "3.3V or 1.8V", tolerance: "±5%", color: "—", notes: "Check chip spec — pin 8 is VCC, pin 4 is GND" },
    { name: "+5VSB", pin: "Near CMOS battery", expected: "5.0V", tolerance: "±5%", color: "—", notes: "Standby rail — should be present when PSU plugged in" },
    { name: "CMOS Battery", pin: "CR2032 holder", expected: "3.0V", tolerance: ">2.9V OK, <2.7V replace", color: "—", notes: "Measure with board unpowered. Below 2.7V causes settings loss" },
  ],
};

export const SPI_CHIP_PINOUT: VoltageReference = {
  connector: "SOIC8 SPI Flash Pinout",
  description: "Standard SPI flash chip pin functions (for probing with multimeter/scope)",
  rails: [
    { name: "/CS (Chip Select)", pin: "1", expected: "High (3.3V) idle, Low (0V) active", tolerance: "—", color: "—", notes: "Active low — pulled low by programmer during communication" },
    { name: "DO (MISO)", pin: "2", expected: "Data output", tolerance: "—", color: "—", notes: "Data from chip to programmer" },
    { name: "/WP (Write Protect)", pin: "3", expected: "High (3.3V) = write enabled", tolerance: "—", color: "—", notes: "Must be HIGH to allow writes. Some boards tie this LOW" },
    { name: "GND", pin: "4", expected: "0V", tolerance: "—", color: "—", notes: "Ground — verify continuity to board ground" },
    { name: "DI (MOSI)", pin: "5", expected: "Data input", tolerance: "—", color: "—", notes: "Data from programmer to chip" },
    { name: "CLK (Clock)", pin: "6", expected: "Clock signal", tolerance: "—", color: "—", notes: "SPI clock from programmer" },
    { name: "/HOLD", pin: "7", expected: "High (3.3V)", tolerance: "—", color: "—", notes: "Must be HIGH for normal operation. Low pauses communication" },
    { name: "VCC", pin: "8", expected: "3.3V or 1.8V", tolerance: "±5%", color: "—", notes: "Power supply — MUST match chip spec. 3.3V to 1.8V chip = damage" },
  ],
};

export const ALL_REFERENCES = [ATX_24PIN, EPS_8PIN, PCIE_6PIN, BOARD_TEST_POINTS, SPI_CHIP_PINOUT];
