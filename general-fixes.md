# General Fixes

## Auto-Scroll

### Requirement 1: Flip the algorithm
- Current: Scroll 5s → Pause 60s → Repeat
- New: Pause 60s → Scroll 15s → Repeat
- Applies to Chat mode
- Status: IMPLEMENTED

### Requirement 2: E-Reader auto-scroll
- Auto-scroll icon exists in e-reader input bar but is unused
- Implement same auto-scroll logic for e-reader
- Same pattern: Pause 60s → Scroll 15s → Repeat
- Status: FAILING - button click does nothing

## E-Reader

