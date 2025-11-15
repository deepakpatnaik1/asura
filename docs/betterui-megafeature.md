# Better UI Megafeature

## Requirements

### 1. Markdown Formatting with Brand Color

**Brand Color Reference**: The border color of the send button (teal/cyan accent color)

**Formatting Rules**:

- **Bullets**: Should render as actual bullet points with brand color
- **`### **Heading**`**: Render as H3, bold, brand color
  - Example: `### **Your Playbook**` → H3 heading in brand color, bold
- **`**Text**`**: Render in brand color, NOT bold
  - Example: `**Track**` → brand color text, no bold
- **`*Text*`**: Render in brand color, italics
  - Example: `*Text*` → brand color, italicized
- **`---`**: Completely ignore/remove
  - Usually appears as: line space, `---`, line space
  - Delete the `---` and the second line space

