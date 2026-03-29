@echo off
set "LLVM_BIN=D:\android_sdk\ndk\26.3.11579264\toolchains\llvm\prebuilt\windows-x86_64\bin"
set "SYSROOT=D:\android_sdk\ndk\26.3.11579264\toolchains\llvm\prebuilt\windows-x86_64\sysroot"
echo Compiling abi_bridge.cpp using clang++.exe...
"%LLVM_BIN%\clang++.exe" --target=aarch64-linux-android24 --sysroot="%SYSROOT%" -c e:\projects\listenMate++\src-tauri\linking_hacks\abi_bridge.cpp -o e:\projects\listenMate++\src-tauri\linking_hacks\abi_bridge.o -fPIC -O3
if %ERRORLEVEL% NEQ 0 (
    echo Compilation FAILED with error %ERRORLEVEL%
    exit /b %ERRORLEVEL%
)
echo Compilation SUCCESSFUL!
dir e:\projects\listenMate++\src-tauri\linking_hacks\abi_bridge.o
