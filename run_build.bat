@echo off
echo Cleaning previous builds...
rem if exist "src-tauri\target" rmdir /s /q "src-tauri\target"
if exist "android-build-output.txt" del "android-build-output.txt"

echo Setting environment variables...
rem 设置 Android NDK 和 SDK 路径
set "ANDROID_NDK_HOME=D:/android_sdk/ndk/26.3.11579264"
set "ANDROID_SDK_ROOT=D:/android_sdk"
rem 设置 CMake 工具链文件
set "CMAKE_TOOLCHAIN_FILE=%ANDROID_NDK_HOME%/build/cmake/android.toolchain.cmake"
rem 强制使用 Unix Makefiles 生成器，避免使用 Visual Studio
set "CMAKE_GENERATOR=Unix Makefiles"
set "CMAKE_MAKE_PROGRAM=%ANDROID_NDK_HOME%/prebuilt/windows-x86_64/bin/make.exe"
rem 设置 Android 系统属性
set "CMAKE_SYSTEM_NAME=Android"
set "CMAKE_SYSTEM_PROCESSOR=aarch64"
set "ANDROID_ABI=arm64-v8a"
set "ANDROID_PLATFORM=android-21"
set "CMAKE_BUILD_TYPE=Release"
rem 确保没有 /utf-8 标志
set "CMAKE_C_FLAGS=-DANDROID -ffunction-sections -fdata-sections -fPIC"
set "CMAKE_CXX_FLAGS=-DANDROID -ffunction-sections -fdata-sections -fPIC"
set "CMAKE_ASM_FLAGS=-DANDROID -ffunction-sections -fdata-sections -fPIC"
rem 设置 Android 特定编译器 - 使用目标特定的环境变量，避免影响 host 编译
rem 先清除全局 CC/CXX，防止 cc crate fallback 时使用错误的编译器
set "CC="
set "CXX="
rem cc crate 会优先查找 CC_aarch64_linux_android / CXX_aarch64_linux_android
set "CC_aarch64_linux_android=%ANDROID_NDK_HOME%/toolchains/llvm/prebuilt/windows-x86_64/bin/aarch64-linux-android21-clang.cmd"
set "CXX_aarch64_linux_android=%ANDROID_NDK_HOME%/toolchains/llvm/prebuilt/windows-x86_64/bin/aarch64-linux-android21-clang++.cmd"
set "AR_aarch64_linux_android=%ANDROID_NDK_HOME%/toolchains/llvm/prebuilt/windows-x86_64/bin/llvm-ar.exe"
set "CMAKE_C_COMPILER=%CC_aarch64_linux_android%"
set "CMAKE_CXX_COMPILER=%CXX_aarch64_linux_android%"
set "AR=%ANDROID_NDK_HOME%/toolchains/llvm/prebuilt/windows-x86_64/bin/llvm-ar.exe"

rem 清理 whisper-rs-sys 的 cmake 缓存，防止跨编译时缓存失效
for /d %%i in ("E:\projects\listenMate++\src-tauri\target\aarch64-linux-android\release\build\whisper-rs-sys-*") do rmdir /s /q "%%i"

echo Running Android build...
call npm run tauri android build -- --target aarch64 2>&1 > android-build-output.txt

echo.
echo Build completed!
echo Output saved to android-build-output.txt
echo.
type android-build-output.txt
