export { POST_CODES, lookupPostCode, searchPostCodes, getPhaseDescription } from "./post-codes.js";
export type { PostCode, PostStandard } from "./post-codes.js";

export { FAILURE_PATTERNS, searchFailurePatterns, getPatternsByCategory } from "./failure-patterns.js";
export type { FailurePattern, FailureCause, FailureCategory } from "./failure-patterns.js";

export { POWER_STAGES, analyzePowerSequence } from "./power-sequence.js";
export type { PowerStage, PowerSymptoms, PowerAnalysisResult } from "./power-sequence.js";

export { WORKFLOWS, getWorkflow, listWorkflows, formatWorkflowTree } from "./workflows.js";
export type { Workflow, WorkflowStep, WorkflowConclusion } from "./workflows.js";

export { analyzeSpiReadings, formatScoreBar } from "./spi-integrity.js";
export type { SpiIntegrityReport, SpiReading, SpiPattern } from "./spi-integrity.js";

export { ALL_REFERENCES, ATX_24PIN, EPS_8PIN, PCIE_6PIN, BOARD_TEST_POINTS, SPI_CHIP_PINOUT } from "./voltage-check.js";
export type { VoltageReference, VoltageRail } from "./voltage-check.js";

export { buildTestReport, formatTestSummary } from "./component-tests.js";
export type { TestResult, ChipTestReport } from "./component-tests.js";

export { computeOverallScore, generateReportJson } from "./report.js";
export type { DiagnosticReport } from "./report.js";

export { LAPTOP_FAILURE_PATTERNS, searchLaptopFailurePatterns, getLaptopPatternsByCategory } from "./laptop-failures.js";
export type { LaptopFailurePattern, LaptopFailureCause, LaptopFailureCategory } from "./laptop-failures.js";

export { INTEL_PLATFORMS, AMD_PLATFORMS, ALL_LAPTOP_PLATFORMS, lookupPlatform, analyzeLaptopPower } from "./laptop-power.js";
export type { LaptopPowerStage, LaptopPlatform, LaptopPowerSymptoms, LaptopPowerAnalysis } from "./laptop-power.js";

export { LAPTOP_BRAND_GUIDES, LAPTOP_WORKFLOWS, getLaptopWorkflow, listLaptopWorkflows } from "./laptop-workflows.js";
export type { BrandGuide } from "./laptop-workflows.js";

export { GPU_FAILURE_PATTERNS, searchGpuFailurePatterns, getGpuPatternsByCategory } from "./gpu-failures.js";
export type { GpuFailurePattern, GpuFailureCause, GpuFailureCategory } from "./gpu-failures.js";

export { parseVbios, formatVbiosReport } from "./gpu-vbios.js";
export type { VbiosInfo, VbiosTable, VbiosTimingEntry, VbiosPowerEntry } from "./gpu-vbios.js";

export { VRM_CONTROLLERS, VRM_FAULT_SIGNATURES, lookupVrmController, getVrmFaultsForController, searchVrmFaults } from "./gpu-vrm.js";
export type { VrmController, VrmFaultSignature } from "./gpu-vrm.js";

export { GPU_MEMORY_TEST_PATTERNS, VRAM_CHIPS, MEMORY_FAULT_DIAGNOSES, lookupVramChip, diagnoseMemoryFault } from "./gpu-memory.js";
export type { GpuMemoryTestPattern, GpuMemoryDiagResult, VramInfo, MemoryFaultDiagnosis } from "./gpu-memory.js";

export { SSD_CONTROLLERS, SSD_FAILURE_PATTERNS, lookupSsdController, searchSsdControllers, getSsdFailuresByController, searchSsdFailures } from "./ssd-controllers.js";
export type { SsdController, SsdFailurePattern } from "./ssd-controllers.js";

export { NAND_CHIPS, NAND_DIAG_PATTERNS, NAND_HEALTH_INDICATORS, lookupNandChip, searchNandDiagPatterns, getNandPatternsByCategory, interpretSmartAttribute } from "./nand-diagnostics.js";
export type { NandChipInfo, NandDiagPattern, NandHealthIndicator } from "./nand-diagnostics.js";

export { HDD_PCB_CHIPS, HDD_PCB_PROCEDURES, HDD_PCB_FAILURE_PATTERNS, lookupHddPcbChip, searchHddProcedures, getHddProceduresByManufacturer, searchHddPcbFailures } from "./hdd-pcb.js";
export type { HddPcbChip, HddPcbProcedure, HddPcbFailurePattern } from "./hdd-pcb.js";

export { STORAGE_WORKFLOWS, getStorageWorkflow, listStorageWorkflows, searchStorageWorkflows } from "./storage-workflows.js";
export type { StorageWorkflow, StorageWorkflowStep, StorageWorkflowConclusion } from "./storage-workflows.js";

export { ROUTER_FIRMWARE_LAYOUTS, ROUTER_RECOVERY_PROCEDURES, lookupRouterFirmware, searchRouterRecovery, getRouterByBrand, getRecoveryByBrand } from "./router-firmware.js";
export type { RouterFirmwareLayout, RouterPartition, RouterRecoveryProcedure } from "./router-firmware.js";

export { MCU_DATABASE, JTAG_PINOUTS, EMBEDDED_FAILURE_PATTERNS, POE_CONTROLLERS, lookupMcu, getJtagPinout, listJtagPinouts, searchEmbeddedFailures, getEmbeddedFailuresByCategory, lookupPoEController } from "./embedded-systems.js";
export type { McuInfo, JtagPinout, EmbeddedFailurePattern, PoEController } from "./embedded-systems.js";
