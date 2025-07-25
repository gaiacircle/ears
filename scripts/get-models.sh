#!/usr/bin/env bash

# This script downloads the ASR and VAD models required for the application.
# It should be run from the root of the project.

set -e # Exit immediately if a command exits with a non-zero status.

# --- Directory Setup ---
MODELS_DIR="app/public/models"
VAD_DIR="$MODELS_DIR/onnx-community/silero-vad/onnx"
# ASR_DIR="$MODELS_DIR/onnx-community/moonshine-base-ONNX"
ASR_DIR="$MODELS_DIR/onnx-community/lite-whisper-large-v3-turbo-fast-ONNX"
ASR_ONNX_DIR="$ASR_DIR/onnx"

echo "Creating model directories..."
# mkdir -p "$VAD_DIR"
mkdir -p "$ASR_ONNX_DIR"

# --- VAD Model (silero-vad) ---
VAD_URL="https://huggingface.co/onnx-community/silero-vad/resolve/main/onnx/model.onnx"
VAD_DEST="$VAD_DIR/model.onnx"
# echo "Downloading VAD model to $VAD_DEST..."
# curl -L -o "$VAD_DEST" "$VAD_URL"

# --- ASR Model (moonshine-base-ONNX) ---
# BASE_ASR_URL="https://huggingface.co/onnx-community/moonshine-base-ONNX/resolve/main"
BASE_ASR_URL="https://huggingface.co/onnx-community/lite-whisper-large-v3-turbo-fast-ONNX/resolve/main"

declare -A asr_files=(
  ["config.json"]="config.json"
  ["generation_config.json"]="generation_config.json"
  ["preprocessor_config.json"]="preprocessor_config.json"
  ["tokenizer.json"]="tokenizer.json"
  ["tokenizer_config.json"]="tokenizer_config.json"
  ["onnx/encoder_model.onnx"]="onnx/encoder_model.onnx"
  ["onnx/decoder_model_merged.onnx"]="onnx/decoder_model_merged.onnx"
)

echo "Downloading ASR model files..."
for file_path in "${!asr_files[@]}"; do
  dest_path="${asr_files[$file_path]}"
  url="$BASE_ASR_URL/$file_path"
  dest="$ASR_DIR/$dest_path"
  echo "  -> Downloading $dest..."
  echo "     $url"
  curl -L -o "$dest" "$url"
done

echo "All models downloaded successfully."