@echo off
setlocal

:: =================================================================
:: Ting Android Build Script
:: =================================================================
:: This script sets up the environment and runs the Tauri Android build.
:: Ported from fix_and_build.bat - Optimized with relative paths.

:: --- User Configuration ---
:: Adjust these paths if your Android SDK/NDK is installed elsewhere.
set "ANDROID_SDK_ROOT=D:/android_sdk"
set "ANDROID_NDK_HOME=D:/android_sdk/ndk/26.3.11579264"
:: -------------------------

echo [BUILD] Initializing environment...

:: [FIX] TOTAL ENVIRONMENT PURGE - PREVENT LEGACY INJECTION
set "RUSTFLAGS="
set "CC_aarch64_linux_android="
set "CXX_aarch64_linux_android="
set "AR_aarch64_linux_android="
set "VSINSTALLDIR="
set "VisualStudioVersion="
set "MSBuildLoadMicrosoftTargetsReadOnly="
set "VCToolsInstallDir="
set "INCLUDE="
set "LIB="
set "LIBPATH="

:: [FIX] Mandate dynamic ONNX Runtime linking via the official Android AAR
set "ORT_STRATEGY=system"
set "ORT_LIB_LOCATION=%~dp0src-tauri\ort_libs"
set "ORT_PREFER_DYNAMIC_LINK=1"

:: Android Toolchain configuration
set "CMAKE_TOOLCHAIN_FILE=%ANDROID_NDK_HOME%/build/cmake/android.toolchain.cmake"
set "CMAKE_GENERATOR=Unix Makefiles"
set "CMAKE_MAKE_PROGRAM=%ANDROID_NDK_HOME%/prebuilt/windows-x86_64/bin/make.exe"
set "CMAKE_SYSTEM_NAME=Android"
set "CMAKE_SYSTEM_PROCESSOR=aarch64"
set "ANDROID_ABI=arm64-v8a"
set "ANDROID_PLATFORM=android-21"
set "CMAKE_BUILD_TYPE=Release"
set "CMAKE_C_FLAGS=-DANDROID -ffunction-sections -fdata-sections -fPIC"
set "CMAKE_CXX_FLAGS=-DANDROID -ffunction-sections -fdata-sections -fPIC"
set "CMAKE_ASM_FLAGS=-DANDROID -ffunction-sections -fdata-sections -fPIC"

set "CC="
set "CXX="
set "CC_aarch64_linux_android=%ANDROID_NDK_HOME%/toolchains/llvm/prebuilt/windows-x86_64/bin/aarch64-linux-android21-clang.cmd"
set "CXX_aarch64_linux_android=%ANDROID_NDK_HOME%/toolchains/llvm/prebuilt/windows-x86_64/bin/aarch64-linux-android21-clang++.cmd"
set "AR_aarch64_linux_android=%ANDROID_NDK_HOME%/toolchains/llvm/prebuilt/windows-x86_64/bin/llvm-ar.exe"
set "CMAKE_C_COMPILER=%CC_aarch64_linux_android%"
set "CMAKE_CXX_COMPILER=%CXX_aarch64_linux_android%"
set "AR=%ANDROID_NDK_HOME%/toolchains/llvm/prebuilt/windows-x86_64/bin/llvm-ar.exe"
set "CLANG_PATH=%ANDROID_NDK_HOME%/toolchains/llvm/prebuilt/windows-x86_64/bin/clang.exe"

set "BINDGEN_EXTRA_CLANG_ARGS_aarch64_linux_android=--sysroot=%ANDROID_NDK_HOME%/toolchains/llvm/prebuilt/windows-x86_64/sysroot -I%ANDROID_NDK_HOME%/toolchains/llvm/prebuilt/windows-x86_64/sysroot/usr/include/aarch64-linux-android -I%ANDROID_NDK_HOME%/toolchains/llvm/prebuilt/windows-x86_64/sysroot/usr/include"
set "BINDGEN_EXTRA_CLANG_ARGS=--sysroot=%ANDROID_NDK_HOME%/toolchains/llvm/prebuilt/windows-x86_64/sysroot -I%ANDROID_NDK_HOME%/toolchains/llvm/prebuilt/windows-x86_64/sysroot/usr/include"

:: [FIX] Cleaning whisper-rs-sys cache to prevent build errors
echo [BUILD] Cleaning whisper-rs-sys cache...
for /d %%i in ("%~dp0src-tauri\target\aarch64-linux-android\debug\build\whisper-rs-sys-*") do rmdir /s /q "%%i"
for /d %%i in ("%~dp0src-tauri\target\aarch64-linux-android\release\build\whisper-rs-sys-*") do rmdir /s /q "%%i"

echo [BUILD] Running Android build (RELEASE)...
call npm run tauri android build -- --target aarch64 --apk -vv

echo.
echo [DONE] Android build completed. 
echo [HINT] Remember to sign the APK before installing on a device if it's a release build.
pause
endlocal
