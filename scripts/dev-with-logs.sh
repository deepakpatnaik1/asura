#!/bin/bash

# Dev server with log capture
# - Full logs saved to logs/dev-TIMESTAMP.log
# - Filtered logs displayed in terminal

# Create logs directory
mkdir -p logs

# Generate timestamped log file
LOGFILE="logs/dev-$(date +%Y%m%d-%H%M%S).log"

echo "Starting dev server..."
echo "Full logs: $LOGFILE"
echo "Filtered output below (Ctrl+C to stop)"
echo "----------------------------------------"

# Kill any existing process on port 5173
lsof -ti:5173 | xargs kill -9 2>/dev/null

# Start dev server, tee to logfile, filter for display
npm run dev 2>&1 | tee "$LOGFILE" | grep --line-buffered -E '\[(Compression|Chat API|Embedding|Database|Token Tracking|Background)\]|error|Error|ERROR|failed|Failed|FAILED'
