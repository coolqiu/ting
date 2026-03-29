set(ANDROID_ABI "arm64-v8a")
set(ANDROID_PLATFORM "android-24")
# Use shared C++ runtime (default)
set(ANDROID_STL "c++_shared")

# Prevent CMake from trying to use Visual Studio instance when using Makefiles/Ninja
set(CMAKE_GENERATOR_INSTANCE "" CACHE STRING "" FORCE)

# Strip MSVC-specific flags that the cmake crate might have injected
# Note: These might be in CMAKE_C_FLAGS / CMAKE_CXX_FLAGS passed via -D
string(REPLACE "/utf-8" "" CMAKE_C_FLAGS "${CMAKE_C_FLAGS}")
string(REPLACE "/utf-8" "" CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS}")

# Remove any other common MSVC flags
string(REPLACE "/W3" "" CMAKE_C_FLAGS "${CMAKE_C_FLAGS}")
string(REPLACE "/W3" "" CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS}")
string(REPLACE "/EHsc" "" CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS}")
string(REPLACE "/O2" "" CMAKE_C_FLAGS "${CMAKE_C_FLAGS}")
string(REPLACE "/O2" "" CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS}")
string(REPLACE "/Ob2" "" CMAKE_C_FLAGS "${CMAKE_C_FLAGS}")
string(REPLACE "/Ob2" "" CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS}")

# Clean up leading/trailing spaces
string(STRIP "${CMAKE_C_FLAGS}" CMAKE_C_FLAGS)
string(STRIP "${CMAKE_CXX_FLAGS}" CMAKE_CXX_FLAGS)

# Force these back into the cache so they override command line arguments
set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS}" CACHE STRING "Flags used by the C compiler during all build types." FORCE)
set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS}" CACHE STRING "Flags used by the CXX compiler during all build types." FORCE)

include("D:/android_sdk/ndk/26.3.11579264/build/cmake/android.toolchain.cmake")
