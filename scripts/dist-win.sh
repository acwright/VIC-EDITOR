#!/usr/bin/env bash
# Build the Windows NSIS installer (x64) on macOS using native Wine.
# Prerequisites: Wine (`brew install --cask wine-stable`).
#
# CSC_IDENTITY_AUTO_DISCOVERY=false stops electron-builder finding the macOS
# code-signing identity and trying to use it on a Windows target. The installer
# ships unsigned, so Windows shows a SmartScreen warning on first run.
set -euo pipefail

CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --win
