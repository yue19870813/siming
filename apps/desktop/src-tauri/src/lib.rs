#[tauri::command]
fn core_version() -> &'static str {
    siming_core::version()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![core_version])
        .run(tauri::generate_context!())
        .expect("failed to run Siming desktop application");
}

#[cfg(test)]
mod tests {
    #[test]
    fn ipc_version_comes_from_shared_core() {
        assert_eq!(super::core_version(), siming_core::VERSION);
    }
}
