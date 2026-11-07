#!/bin/sh
# Builds contracts/soroban with stellar-cli inside Docker (no local Rust needed) and copies the wasm to public/.
set -e
cd "$(dirname "$0")/.."
docker run --rm -v "$PWD/contracts/soroban:/w" -v nft-cargo-registry:/usr/local/cargo/registry -w /w rust:1.99.1 sh -c '
  set -e
  apt-get update -qq >/dev/null && apt-get install -y -qq libdbus-1-3 >/dev/null
  rustup target add wasm32v1-none >/dev/null
  A=$(uname -m); [ "$A" = arm64 ] && A=aarch64
  curl -sL https://github.com/stellar/stellar-cli/releases/download/v28.1.0/stellar-cli-28.1.0-$A-unknown-linux-gnu.tar.gz | tar xz -C /usr/local/bin
  stellar contract build 2>&1 | tail -15'
cp contracts/soroban/target/wasm32v1-none/release/playground_nft.wasm public/playground_nft.wasm
ls -la public/playground_nft.wasm
shasum -a 256 public/playground_nft.wasm 2>/dev/null || sha256sum public/playground_nft.wasm
