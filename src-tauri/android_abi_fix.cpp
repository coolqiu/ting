#include <jni.h>

#ifdef __cplusplus
extern "C" {
#endif

// Stub for advapi32.dll functions that some dependencies try to link against
// This prevents "undefined reference to __imp_CryptAcquireContextW" errors

typedef void* HCRYPTPROV;
typedef void* HCRYPTKEY;
typedef void* HCRYPTHASH;

int CryptAcquireContextW(HCRYPTPROV* phProv, const wchar_t* pszContainer, const wchar_t* pszProvider, unsigned long dwProvType, unsigned long dwFlags) {
    return 0;
}

int CryptReleaseContext(HCRYPTPROV hProv, unsigned long dwFlags) {
    return 0;
}

int CryptGenKey(HCRYPTPROV hProv, unsigned long Algid, unsigned long dwFlags, HCRYPTKEY* phKey) {
    return 0;
}

int CryptDestroyKey(HCRYPTKEY hKey) {
    return 0;
}

int CryptHashData(HCRYPTHASH hHash, const unsigned char* pbData, unsigned long dwDataLen, unsigned long dwFlags) {
    return 0;
}

int CryptDeriveKey(HCRYPTPROV hProv, unsigned long Algid, HCRYPTHASH hBaseData, unsigned long dwFlags, HCRYPTKEY* phKey) {
    return 0;
}

int CryptEncrypt(HCRYPTKEY hKey, HCRYPTHASH hHash, int Final, unsigned long dwFlags, unsigned char* pbData, unsigned long* pdwDataLen, unsigned long dwBufLen) {
    return 0;
}

int CryptDecrypt(HCRYPTKEY hKey, HCRYPTHASH hHash, int Final, unsigned long dwFlags, unsigned char* pbData, unsigned long* pdwDataLen) {
    return 0;
}

int CryptCreateHash(HCRYPTPROV hProv, unsigned long Algid, HCRYPTKEY hKey, unsigned long dwFlags, HCRYPTHASH* phHash) {
    return 0;
}

int CryptDestroyHash(HCRYPTHASH hHash) {
    return 0;
}

int CryptGetHashParam(HCRYPTHASH hHash, unsigned long dwParam, unsigned char* pbData, unsigned long* pdwDataLen, unsigned long dwFlags) {
    return 0;
}

int CryptSetHashParam(HCRYPTHASH hHash, unsigned long dwParam, const unsigned char* pbData, unsigned long dwFlags) {
    return 0;
}

// Stub for other advapi32 functions that might be referenced
int RegOpenKeyExW(void* hKey, const wchar_t* lpSubKey, unsigned long ulOptions, unsigned long samDesired, void** phkResult) {
    return 0;
}

int RegCloseKey(void* hKey) {
    return 0;
}

int RegQueryValueExW(void* hKey, const wchar_t* lpValueName, unsigned long* lpReserved, unsigned long* lpType, unsigned char* lpData, unsigned long* lpcbData) {
    return 0;
}

// Android ABI compatibility fixes
void* __cxa_allocate_exception(unsigned int thrown_size) {
    return 0;
}

void __cxa_deallocate_exception(void* p) {
}

void __cxa_throw(void* obj, void* tinfo, void (*dest)(void*)) {
}

void __cxa_rethrow() {
}

void __cxa_bad_cast() {
}

void __cxa_bad_typeid() {
}

void* __cxa_begin_catch(void* exception_object) {
    return exception_object;
}

void __cxa_end_catch() {
}

void __cxa_call_unexpected(void* exception_object) {
}

#ifdef __cplusplus
}
#endif
