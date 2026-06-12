#!/usr/bin/env bash
# Build the minimal ffmpeg sidecar used by the desktop clip export
# (Analisi video → "Scarica videoclip filtrato").
#
# Stream-copy only: no encoders, no decoders, no real filters — just the
# demuxers/muxers/parsers needed to cut and concat match videos. The binary
# stays in the single-digit MB range. ffmpeg is GPL here (--enable-gpl),
# which is fine: OpenVolleyScout is AGPL-3.0.
#
# Usage:
#   scripts/build-minimal-ffmpeg.sh [rust-target-triple]
#
# Without arguments the host triple is used (requires rustc). Produces
#   src-tauri/binaries/ffmpeg-<triple>[.exe]
# which is what tauri.{linux,windows,macos}.conf.json expect as externalBin.
#
# Supported triples:
#   x86_64-unknown-linux-gnu   native build (gcc/clang + make)
#   x86_64-pc-windows-msvc     cross build with mingw-w64 (run on Linux;
#                              the rust triple only names the artifact)
#   x86_64-apple-darwin        on macOS (clang -arch x86_64)
#   aarch64-apple-darwin       on macOS (clang -arch arm64)
set -euo pipefail

FFMPEG_VERSION="${FFMPEG_VERSION:-7.1}"
TRIPLE="${1:-$(rustc -vV | sed -n 's/^host: //p')}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT/src-tauri/binaries"
BUILD_DIR="${FFMPEG_BUILD_DIR:-$ROOT/.ffmpeg-build}"
SRC_DIR="$BUILD_DIR/ffmpeg-$FFMPEG_VERSION"

mkdir -p "$BUILD_DIR" "$OUT_DIR"

if [ ! -d "$SRC_DIR" ]; then
  echo "Downloading ffmpeg $FFMPEG_VERSION sources..."
  curl -fsSL "https://ffmpeg.org/releases/ffmpeg-$FFMPEG_VERSION.tar.xz" -o "$BUILD_DIR/ffmpeg.tar.xz"
  tar -xJf "$BUILD_DIR/ffmpeg.tar.xz" -C "$BUILD_DIR"
fi

# anull/null are the no-op filters the ffmpeg CLI links against; everything
# else stays out. mpegts covers .ts match recordings, concat does the final
# join. Parsers are needed to stream-copy without decoding. The ass demuxer
# muxes the action-code subtitle track into mkv as-is; the text-only ass
# decoder + mov_text encoder cover mp4 outputs (no external deps).
COMMON_FLAGS=(
  --disable-everything
  --disable-autodetect
  --disable-network
  --disable-doc
  --disable-debug
  --disable-ffplay
  --disable-ffprobe
  --disable-avdevice
  --disable-postproc
  --disable-x86asm
  --enable-small
  --enable-gpl
  --enable-protocol=file,pipe
  --enable-demuxer=mov,matroska,avi,mpegts,concat,ass
  --enable-muxer=mp4,matroska
  --enable-decoder=ass
  # configure component name is "movtext"; the runtime codec is "mov_text"
  --enable-encoder=movtext
  --enable-parser=h264,hevc,aac,mpeg4video,mpegaudio,opus,vorbis,vp8,vp9,av1
  --enable-bsf=extract_extradata,h264_mp4toannexb,hevc_mp4toannexb,aac_adtstoasc,vp9_superframe
  --enable-filter=anull,null
)

EXT=""
STRIP="strip"
case "$TRIPLE" in
  x86_64-unknown-linux-gnu)
    TARGET_FLAGS=()
    ;;
  x86_64-pc-windows-msvc)
    TARGET_FLAGS=(
      --enable-cross-compile
      --target-os=mingw32
      --arch=x86_64
      --cross-prefix=x86_64-w64-mingw32-
    )
    EXT=".exe"
    STRIP="x86_64-w64-mingw32-strip"
    ;;
  x86_64-apple-darwin)
    TARGET_FLAGS=(
      --enable-cross-compile
      --target-os=darwin
      --arch=x86_64
      --cc="clang -arch x86_64"
    )
    ;;
  aarch64-apple-darwin)
    TARGET_FLAGS=(
      --enable-cross-compile
      --target-os=darwin
      --arch=arm64
      --cc="clang -arch arm64"
    )
    ;;
  *)
    echo "Unsupported target triple: $TRIPLE" >&2
    exit 1
    ;;
esac

cd "$SRC_DIR"
make distclean >/dev/null 2>&1 || true
./configure "${COMMON_FLAGS[@]}" "${TARGET_FLAGS[@]}"

JOBS="$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 2)"
make -j"$JOBS"

OUT_FILE="$OUT_DIR/ffmpeg-$TRIPLE$EXT"
cp "ffmpeg$EXT" "$OUT_FILE"
"$STRIP" "$OUT_FILE" 2>/dev/null || true

echo "Built $OUT_FILE ($(du -h "$OUT_FILE" | cut -f1))"
