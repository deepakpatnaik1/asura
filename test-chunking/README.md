# Chunking Test Directory

## Purpose

Test the logical chunking capabilities of Qwen3-235B-A22B before integrating into the main file upload pipeline.

## Files

- `input/` - Drop your test documents here
- `output/` - Chunking results will be saved here
- `test-chunking.js` - The test script

## Usage

1. Drop a text file into `input/` folder (e.g., `input/my-document.txt`)
2. Run: `node test-chunking.js input/my-document.txt`
3. View results in `output/my-document-chunks.json`

## What Gets Tested

- Logical boundary detection
- Chunk coherence
- Conversation-sized output
- Instruction-following accuracy
