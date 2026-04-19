use anyhow::Context;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::Path;

/// Append one iteration entry as a JSON line to the log file.
///
/// If the file does not exist it is created. Each call writes exactly one
/// newline-terminated JSON object, so the file is valid JSONL.
pub fn append_metrics(path: &Path, entry: &serde_json::Value) -> anyhow::Result<()> {
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .with_context(|| format!("opening metrics file: {}", path.display()))?;
    let line = serde_json::to_string(entry).context("serialising metrics entry")?;
    writeln!(file, "{}", line).context("writing metrics line")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::fs;
    use std::io::{BufRead, BufReader};

    #[test]
    fn append_creates_file_and_writes_jsonl() {
        let path = std::env::temp_dir().join(format!(
            "pogofish_metrics_test_{}.jsonl",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .subsec_nanos()
        ));
        // Clean up from any previous failed run
        let _ = fs::remove_file(&path);

        append_metrics(&path, &json!({"iteration": 1, "win_rate": 0.55})).unwrap();
        append_metrics(&path, &json!({"iteration": 2, "win_rate": 0.60})).unwrap();

        let file = fs::File::open(&path).unwrap();
        let lines: Vec<String> = BufReader::new(file).lines().map(|l| l.unwrap()).collect();
        assert_eq!(lines.len(), 2);
        let v: serde_json::Value = serde_json::from_str(&lines[0]).unwrap();
        assert_eq!(v["iteration"], 1);

        let _ = fs::remove_file(&path);
    }
}
