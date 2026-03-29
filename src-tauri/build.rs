fn main() {
    println!("cargo:rerun-if-changed=src/sonic-c/sonic.c");
    println!("cargo:rerun-if-changed=src/sonic-c/sonic.h");
    println!("cargo:rerun-if-changed=linking_hacks/abi_bridge.cpp");

    cc::Build::new()
        .file("src/sonic-c/sonic.c")
        .compile("sonic");

    // Add linking hacks for Android
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    let target_arch = std::env::var("CARGO_CFG_TARGET_ARCH").unwrap_or_default();

    if target_os == "android" && target_arch == "aarch64" {
        // Compile the ABI bridge with standard std:: layout to provide strong symbols
        cc::Build::new()
            .cpp(true)
            .define("_LIBCPP_ABI_UNSTABLE", "1")
            .file("linking_hacks/abi_bridge.cpp")
            .compile("abi_bridge");

        // Force link against NDK's libc++_shared
        println!("cargo:rustc-link-arg=-lc++_shared");
    }

    // Add linking hacks for Android (advapi32 stub)
    let project_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
    println!("cargo:rustc-link-search=native={}/linking_hacks", project_dir);

    tauri_build::build();
}
