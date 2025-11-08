# UI Nomenclature

## Top-Level Structure

**chat-area**: Scrollable area where messages are displayed
**input-area**: Entire bottom section for user input and controls
**user-account**: User avatar/account icon (top-right, fixed position)

## Chat Area Components

### Turn Structure
**turn-number**: Turn indicator label ("Turn 1", "Turn 2", etc.)

### Boss Message
**boss-card**: Brown background container wrapping boss-row + message text
**boss-row**: Row containing boss label + boss-actions
**boss-actions**: Action buttons (star, copy, delete, archive, refresh) in boss-row

### Persona Message
**persona-row**: Row containing persona label + persona-actions
**persona-actions**: Action buttons (star, copy, delete, archive, refresh) in persona-row

**Note:** No persona-card exists. Only boss messages have background cards.

## Input Area Components

**input-controls**: Top row containing model/persona selectors and action buttons
**input-container**: Bottom row containing text-field + send-button
**text-field**: Text input field for typing messages
**send-button**: Orange send button

## Component Hierarchy

```
chat-interface
├── chat-area
│   ├── turn-number
│   ├── boss-card
│   │   ├── boss-row
│   │   │   ├── boss-label
│   │   │   └── boss-actions
│   │   └── message-text
│   ├── persona-row
│   │   ├── persona-label
│   │   └── persona-actions
│   └── message-text
├── input-area
│   ├── input-controls
│   └── input-container
│       ├── text-field
│       └── send-button
└── user-account (fixed top-right)
```

## CSS Class Mapping

| Component | CSS Class |
|-----------|-----------|
| chat-area | `.chat-area` (was `.messages-area`) |
| input-area | `.input-area` |
| turn-number | `.turn-number` (was `.turn-indicator`) |
| boss-card | `.boss-card` (was `.boss-message`) |
| boss-row | `.boss-row` (was `.message-header`) |
| boss-actions | `.boss-actions` (was `.message-actions`) |
| persona-row | `.persona-row` (was `.message-header`) |
| persona-actions | `.persona-actions` (was `.message-actions`) |
| input-controls | `.input-controls` |
| input-container | `.input-container` |
| text-field | `.text-field` (was `.message-input`) |
| send-button | `.send-button` |
| user-account | `.user-account` (was `.user-controls`) |

## Design Notes

- **boss-card** has brown semi-transparent background: `var(--boss-bg)`
- **persona messages** sit directly on page background (no card wrapper)
- **boss-row** and **persona-row** have identical structure but different styling
- **turn-number** appears above each turn (boss + persona pair)
- All **-actions** containers use absolute positioning for Figma-like control
