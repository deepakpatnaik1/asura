# Reader Mode Experiment

## Overview

Enhanced e-reader experience with timed reading sessions.

---

## Feature: Reading Timer

### Requirements
- Continuous smooth scroll using RAF with high-precision timestamps
- Scroll speed: 0.006 px/ms (~6 px/second)
- **Time-budget mode**: Countdown from configurable timer (not scroll distance)

### Behavior
- **Configurable reading budget** (default: 20 minutes, range: 1-120 minutes)
- Countdown shows time remaining in reading session, not article length
- Display format: `H:MM:SS` (always show hours, minutes, seconds)
- When timer reaches 0:00 → scroll stops automatically ("get back to work")
- User can tap play again for another session
- **Manual stop**: Timer pauses (preserves remaining time)
- **Article ends**: Scroll container hits bottom → stop and reset

### Settings
- "Reading Timer (minutes)" input in Settings modal
- Location: after the Reader Model dropdown
- Store in `user_settings.reading_timer_minutes` column
- Default: 20 minutes

---

## UI Summary

### Toolbar (Reader Mode)
```
[Play/Timer] [Down] [Up] [Messages] ... [Nuke]
```

- **Play button**: Shows play icon `▶` when idle, countdown `H:MM:SS` when active

### Settings Modal
```
Reader Model: [Dropdown]
Reading Timer: [Input] minutes
```

---

## Technical Notes

### Auto-scroll implementation
- Timer counts down from configured reading budget
- Uses `requestAnimationFrame` with `DOMHighResTimeStamp` for precision
- No longer calculates time based on scroll distance
- Stop conditions:
  1. Timer hits 0:00
  2. Scroll container reaches bottom (article ends)
  3. User manually stops (pauses timer)
