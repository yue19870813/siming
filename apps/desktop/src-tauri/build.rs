fn main() {
    // `tauri::generate_context!` embeds these assets in the development binary.
    // Watch them explicitly so `tauri dev` rebuilds when the application icon changes.
    println!("cargo:rerun-if-changed=icons/icon.icns");
    println!("cargo:rerun-if-changed=icons/icon.png");
    tauri_build::build()
}
