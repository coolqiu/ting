# Internal NDK variables (very important for legacy mode)
set(ANDROID_ABI "arm64-v8a")
set(ANDROID_PLATFORM "android-24")

# Standard CMake variables
set(CMAKE_ANDROID_ARCH_ABI "arm64-v8a")
set(CMAKE_ANDROID_PLATFORM "android-24")

# Force new mode (experimental but might help)
set(ANDROID_USE_LEGACY_TOOLCHAIN_FILE FALSE)

# Also set in cache to prevent overwrites
set(ANDROID_ABI "arm64-v8a" CACHE STRING "" FORCE)
set(ANDROID_PLATFORM "android-24" CACHE STRING "" FORCE)
set(ANDROID_USE_LEGACY_TOOLCHAIN_FILE FALSE CACHE BOOL "" FORCE)

include("D:/android_sdk/ndk/26.3.11579264/build/cmake/android.toolchain.cmake")

# Post-include overrides to kill any armv7 leftovers
set(CMAKE_C_COMPILER_TARGET "aarch64-none-linux-android24" CACHE STRING "" FORCE)
set(CMAKE_CXX_COMPILER_TARGET "aarch64-none-linux-android24" CACHE STRING "" FORCE)
set(CMAKE_ASM_COMPILER_TARGET "aarch64-none-linux-android24" CACHE STRING "" FORCE)
set(CMAKE_SYSTEM_PROCESSOR "aarch64" CACHE STRING "" FORCE)
set(ANDROID_LLVM_TRIPLE "aarch64-none-linux-android24" CACHE STRING "" FORCE)

# Force the flags to be CLEAN
set(CMAKE_C_FLAGS "--target=aarch64-linux-android24 -DANDROID -fPIC" CACHE STRING "" FORCE)
set(CMAKE_CXX_FLAGS "--target=aarch64-linux-android24 -DANDROID -fPIC /utf-8" CACHE STRING "" FORCE)
