use crate::backends::{Backend, WriteOpts};
use crate::types::ChipInfo;
use crate::workflows::pipeline::{
    ConnectionTestData, PipelineBackend, ReadOutcome, VerifyOutcome, WriteOutcome,
};
use sha2::{Digest, Sha256};
use std::fs;

pub struct BackendPipelineAdapter<'a> {
    backend: &'a mut (dyn Backend + Send),
}

impl<'a> BackendPipelineAdapter<'a> {
    pub fn new(backend: &'a mut (dyn Backend + Send)) -> Self {
        Self { backend }
    }
}

fn sha256_hex(bytes: &[u8]) -> String {
    let mut h = Sha256::new();
    h.update(bytes);
    h.finalize().iter().map(|b| format!("{b:02x}")).collect()
}

impl<'a> PipelineBackend for BackendPipelineAdapter<'a> {
    fn connection_test(&mut self) -> Result<ConnectionTestData, String> {
        let r = self.backend.connection_test().map_err(|e| e.to_string())?;
        Ok(ConnectionTestData {
            stable: r.stable,
            reads: r.reads,
            matches: r.matches,
            jedec_id: r.jedec_id,
            timings: r.timings,
            status_register: r.status_register,
        })
    }

    fn identify_chip(&mut self) -> Result<Option<ChipInfo>, String> {
        self.backend.identify_chip().map_err(|e| e.to_string())
    }

    fn read_chip_double_verify(&mut self) -> Result<ReadOutcome, String> {
        let mut tmp1 = tempfile::NamedTempFile::new().map_err(|e| e.to_string())?;
        let mut tmp2 = tempfile::NamedTempFile::new().map_err(|e| e.to_string())?;
        let r1 = self
            .backend
            .read_chip(tmp1.path())
            .map_err(|e| e.to_string())?;
        let r2 = self
            .backend
            .read_chip(tmp2.path())
            .map_err(|e| e.to_string())?;
        let buf1 = fs::read(tmp1.path()).map_err(|e| e.to_string())?;
        let buf2 = fs::read(tmp2.path()).map_err(|e| e.to_string())?;
        // Close + drop temp files explicitly so they get cleaned up.
        let _ = tmp1.as_file_mut();
        let _ = tmp2.as_file_mut();
        if !r1.success || !r2.success {
            return Ok(ReadOutcome {
                success: false,
                size_bytes: r1.size_bytes,
                checksum: r1.checksum,
                data: buf1,
                error: r1.error.or(r2.error),
            });
        }
        if buf1 != buf2 || r1.checksum != r2.checksum {
            return Ok(ReadOutcome {
                success: false,
                size_bytes: buf1.len() as u64,
                checksum: r1.checksum,
                data: buf1,
                error: Some("double-read mismatch — chip read is unstable".into()),
            });
        }
        Ok(ReadOutcome {
            success: true,
            size_bytes: buf1.len() as u64,
            checksum: sha256_hex(&buf1),
            data: buf1,
            error: None,
        })
    }

    fn write_chip(&mut self, data: &[u8]) -> Result<WriteOutcome, String> {
        let tmp = tempfile::NamedTempFile::new().map_err(|e| e.to_string())?;
        fs::write(tmp.path(), data).map_err(|e| e.to_string())?;
        let r = self
            .backend
            .write_chip(tmp.path(), WriteOpts::default())
            .map_err(|e| e.to_string())?;
        Ok(WriteOutcome {
            success: r.success,
            verified: r.verified,
            error: r.error,
            backup_path: r.backup_path,
        })
    }

    fn verify_chip(&mut self, data: &[u8]) -> Result<VerifyOutcome, String> {
        let tmp = tempfile::NamedTempFile::new().map_err(|e| e.to_string())?;
        fs::write(tmp.path(), data).map_err(|e| e.to_string())?;
        let r = self
            .backend
            .verify_chip(tmp.path())
            .map_err(|e| e.to_string())?;
        Ok(VerifyOutcome {
            matches: r.matches,
            chip_checksum: r.chip_checksum,
            file_checksum: r.file_checksum,
        })
    }

    fn is_write_protected(&mut self) -> Result<bool, String> {
        self.backend.is_write_protected().map_err(|e| e.to_string())
    }

    fn disable_write_protection(&mut self) -> Result<(), String> {
        self.backend
            .disable_write_protection()
            .map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::backends::mock::MockBackend;
    use crate::workflows::pipeline::{build_repair_pipeline, run_pipeline, PipelineContext};

    #[test]
    fn adapter_runs_full_repair_pipeline_against_mock() {
        let mut mock = MockBackend::default();
        let mut adapter = BackendPipelineAdapter::new(&mut mock);
        let mut ctx = PipelineContext::new(&mut adapter);
        let result = run_pipeline(&build_repair_pipeline(), &mut ctx);
        assert!(result.success, "pipeline failed: {result:?}");
        assert!(result.steps_completed > 0);
    }

    #[test]
    fn adapter_connection_test_round_trips() {
        let mut mock = MockBackend::default();
        let mut adapter = BackendPipelineAdapter::new(&mut mock);
        let r = adapter.connection_test().expect("connection_test");
        assert!(r.stable || !r.jedec_id.is_empty());
    }

    #[test]
    fn adapter_double_read_succeeds_on_mock() {
        let mut mock = MockBackend::default();
        let mut adapter = BackendPipelineAdapter::new(&mut mock);
        let r = adapter.read_chip_double_verify().expect("double-read");
        assert!(r.success);
        assert_eq!(r.size_bytes as usize, r.data.len());
        assert_eq!(r.checksum.len(), 64);
    }
}
