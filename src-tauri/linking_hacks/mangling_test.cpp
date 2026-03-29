#include <ios>

template class std::basic_ios<char>;

void dummy() {
    std::basic_ios<char> x;
    x.init(nullptr);
}
