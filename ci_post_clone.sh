#!/bin/zsh

# --- Xcode Cloud Post-Clone Script for Tauri ---
# This script prepares the environment by installing Rust and Node.js dependencies.

set -e # Exit on error

echo "--- Preparing environment for Tauri iOS build ---"

# 1. Install Rustup and Rust
if ! command -v rustup &> /dev/null; then
    echo "Installing Rust..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source $HOME/.cargo/env
else
    echo "Rust is already installed."
fi

# Ensure iOS targets are installed
rustup target add aarch64-apple-ios aarch64-apple-ios-sim

# 2. Install Node.js dependencies
echo "Installing Node.js dependencies..."
npm install

# 3. Install Tauri CLI
echo "Installing Tauri CLI..."
npm install -g @tauri-apps/cli@next

# 4. Preparing the Apple Project
# Since we are in the CI post-clone, we sync the Tauri core to the native project
echo "Running Tauri iOS Build (Sync)..."
npx tauri ios build --no-dev

echo "--- Preparation Complete ---"
