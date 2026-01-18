fn main() {
    // Include custom NSIS installer script
    // This ensures the installer.nsh file is included during NSIS build
    println!("cargo:rerun-if-changed=installer.nsh");
    tauri_build::build()
}
