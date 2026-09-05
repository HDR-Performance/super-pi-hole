# Mbed TLS source

`mbedtls-4.0.0.tar.bz2` is the complete official Mbed TLS 4.0.0 release source,
including its bundled TF-PSA-Crypto/framework content and original licenses.
Source: https://github.com/Mbed-TLS/mbedtls/releases/tag/mbedtls-4.0.0

SHA256: `2f3a47f7b3a541ddef450e4867eeecb7ce2ef7776093f3a11d6d43ead6bf2827`
This matches the official release asset's GitHub digest. The archive is
unmodified. `deploy/Dockerfile.integrated` enables the threading configuration
in the extracted build copy, as required by the pinned Pi-hole FTL build, and
compiles it statically. No upstream downloads occur during the image build.
Original license choices/notices are inside the archive; our MIT application
license does not replace them.
