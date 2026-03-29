#include <ios>
#include <streambuf>
#include <dlfcn.h>
#include <android/log.h>

// Helper to access protected members of basic_ios
struct patch_ios : public std::basic_ios<char> {
    using std::basic_ios<char>::init;
};

extern "C" {
    // 1. MANUALLY PROVIDE THE MISSING VTABLE AND TYPEINFO ARRAYS
    // These data structures will satisfy the dynamic linker at load time.
    void* _ZTVSt9basic_iosIcSt11char_traitsIcEE[16];
    void* _ZTISt9basic_iosIcSt11char_traitsIcEE[16];

    // 2. RUNTIME VTABLE PATCHER
    // This constructor runs automatically when our shared library is loaded,
    // allowing us to hot-swap the dummy vtable arrays with real NDK contents.
    __attribute__((constructor))
    void patch_vtables() {
        void* handle = dlopen("libc++_shared.so", RTLD_NOLOAD | RTLD_NOW);
        if (!handle) handle = dlopen("libc++_shared.so", RTLD_NOW);
        if (handle) {
            void* real_vtable = dlsym(handle, "_ZTVNSt6__ndk19basic_iosIcNS_11char_traitsIcEEEE");
            if (real_vtable) {
                // Copy 16 pointers (sufficient for basic_ios vtable) to our exported symbol
                for (int i = 0; i < 16; i++) {
                    _ZTVSt9basic_iosIcSt11char_traitsIcEE[i] = ((void**)real_vtable)[i];
                }
                __android_log_print(ANDROID_LOG_INFO, "ABI_PATCH", "Successfully loaded runtime vtable array for basic_ios");
            }
            
            void* real_typeinfo = dlsym(handle, "_ZTINSt6__ndk19basic_iosIcNS_11char_traitsIcEEEE");
            if (real_typeinfo) {
                for (int i = 0; i < 16; i++) {
                    _ZTISt9basic_iosIcSt11char_traitsIcEE[i] = ((void**)real_typeinfo)[i];
                }
            }
        }
    }

    // 3. LEGACY FUNCTION WRAPPERS
    // _ZNSt9basic_iosIcSt11char_traitsIcEE4initEPSt15basic_streambufIcS1_E
    void _ZNSt9basic_iosIcSt11char_traitsIcEE4initEPSt15basic_streambufIcS1_E(std::basic_ios<char>* obj, std::basic_streambuf<char>* sb) {
        static_cast<patch_ios*>(obj)->init(sb);
    }

    // _ZNSt9basic_iosIcSt11char_traitsIcEE5clearESt12_Ios_Iostate
    void _ZNSt9basic_iosIcSt11char_traitsIcEE5clearESt12_Ios_Iostate(std::basic_ios<char>* obj, std::ios_base::iostate state) {
        obj->clear(state);
    }

    // _ZNSt9basic_iosIcSt11char_traitsIcEE5rdbufEPSt15basic_streambufIcS1_E
    void _ZNSt9basic_iosIcSt11char_traitsIcEE5rdbufEPSt15basic_streambufIcS1_E(std::basic_ios<char>* obj, std::basic_streambuf<char>* sb) {
        obj->rdbuf(sb);
    }
}
