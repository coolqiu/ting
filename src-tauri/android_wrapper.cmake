# Absolute Toolchain Wrapper for Android ABI Fix
set(ANDROID_NDK "D:/android_sdk/ndk/26.3.11579264")
set(ANDROID_ABI "arm64-v8a")
set(ANDROID_PLATFORM "android-24")

# Include the real (and patched) NDK toolchain
include("${ANDROID_NDK}/build/cmake/android.toolchain.cmake")

# Force overwrite of any leftover armv7 flags
set(CMAKE_SYSTEM_PROCESSOR "aarch64" CACHE INTERNAL "" FORCE)
set(CMAKE_ANDROID_ARCH_ABI "arm64-v8a" CACHE INTERNAL "" FORCE)
