// Workflow orchestration: backup + repair pipelines.
// Ports src/workflows/pipeline.ts (synchronous in Rust  -  IO is blocking).

pub mod pipeline;
pub mod pipeline_adapter;
