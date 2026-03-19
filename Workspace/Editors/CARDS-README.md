# Canvas Card Format — LLM Guide

How to programmatically create and insert cards into the canvas JSON file.

## File Location

The active canvas file is: `canvas.json` (in this directory)

## JSON Structure

```json
{
  "cards": [ ... ],
  "connections": [ ... ],
  "camera": { "x": 0, "y": 0, "zoom": 1 }
}
```

## Card Schema

```json
{
  "id": "unique-string",
  "x": 100,
  "y": 200,
  "w": 320,
  "h": 200,
  "color": "#FFF8E7",
  "content": "# Heading\n\nSome **bold** text\n\n- bullet one\n- bullet two"
}
```

### Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique ID. Use `Date.now().toString(36) + Math.random().toString(36).slice(2, 8)` or any unique string |
| `x` | number | X position in world coordinates (pixels from origin) |
| `y` | number | Y position in world coordinates |
| `w` | number | Width in pixels. **Default: 320.** Range: 200-600 recommended |
| `h` | number | Height in pixels. **Default: 200.** Range: 150-400 recommended |
| `color` | string | Hex color for card background |
| `content` | string | Markdown text content |

### Available Colors

| Name | Light Mode | Use For |
|------|-----------|---------|
| Cream | `#FFF8E7` | Default / general |
| Peach | `#FFE8D6` | Warm emphasis |
| Coral | `#FFD6CC` | Alerts / important |
| Butter | `#FFF3C4` | Highlights |
| Mint | `#D8F0E0` | Positive / done |
| Sage | `#E0E8D0` | Neutral grouping |
| Sky | `#DBEAFE` | Info / reference |
| Lavender | `#E8DFEF` | Creative / ideas |

### Rendering Dimensions (exact CSS values)

These are the exact rendering properties — use them to predict how content will look inside a card.

**Card container:**
- Border radius: 8px
- Border: 1px solid (light gray in light mode)
- Min width: 160px, min height: 80px
- Shadow: subtle drop shadow

**Card body (content area):**
- Padding: 10px top/bottom, 12px left/right
- Font: `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`
- Font size: 14px
- Line height: 1.5 (= 21px per line)
- Word wrap: break-word
- Overflow: auto (scrolls if content exceeds height)

**Usable content width** = card.w - 24px (12px padding each side) - 2px (border)
- A 320px wide card has ~294px of usable text width
- At 14px system font, this fits roughly **40-50 characters per line**

**Usable content height** = card.h - 20px (10px padding each side) - 2px (border)
- A 200px tall card has ~178px of usable text height
- At 21px per line, this fits roughly **8 lines** of body text

### Content Formatting (Markdown)

Cards use Tiptap (ProseMirror) for editing, which supports markdown input rules. The display renderer handles the same subset.

**Headings** (rendered at distinct sizes in both edit and display mode):
- `# H1` → font-size: 1.5em (21px), font-weight: 700, margin: 0.3em top/bottom
- `## H2` → font-size: 1.25em (17.5px), font-weight: 700, margin: 0.25em
- `### H3` → font-size: 1.1em (15.4px), font-weight: 600, margin: 0.2em

**Inline formatting:**
- `**bold**` → font-weight: 700
- `*italic*` → font-style: italic
- `` `inline code` `` → monospace, light gray background, 0.9em font-size, 3px border-radius

**Lists:**
- `- item` or `* item` → unordered list with bullet
- `1. item` → ordered list with number
- Lists have 1.5em left padding, no extra margin per item
- Tiptap wraps list item text in `<p>` tags (margin normalized to 0)

**Links:**
- `[text](url)` → underlined, inherits text color

**Paragraphs:**
- Blank line between text creates a new paragraph
- Paragraph margin: 0.3em top/bottom
- Single newline within a paragraph: depends on context (Tiptap treats Enter as new paragraph)

**Not supported:** Tables, images, blockquotes, horizontal rules, code blocks (fenced). Keep content simple.

### Estimating Card Size from Content

Use this to calculate how big a card should be:

```
lines_needed = 0
for each line in content.split('\n'):
    if line starts with '#':  # heading
        lines_needed += 2  # heading + margin
    elif line starts with '- ':  # list item
        lines_needed += 1
    elif line == '':  # blank line
        lines_needed += 0.5
    else:  # body text
        chars = len(line)
        wrapped_lines = ceil(chars / 45)  # ~45 chars per line at 320w
        lines_needed += wrapped_lines

height = max(150, lines_needed * 21 + 40)  # 21px/line + 40px padding
width = 320  # default, increase for wide content
```

**Tip:** Keep card content concise. A card should hold ONE idea, ONE concept, ONE grouping. If you need more space, make the card wider/taller or split into multiple cards.

### Keyboard Shortcuts (when cards are selected, not editing)

- `Cmd+A` — select all cards
- `Escape` — deselect all
- `Delete` / `Backspace` — delete selected (confirms if >1)
- `Cmd+D` — duplicate selected cards (offset 30px down-right)
- `Arrow keys` — nudge selected cards by 10px
- `Shift+Click` — toggle card in/out of selection
- Click empty canvas — deselect all
- Drag on empty canvas — rubber band / marquee select

## Connection Schema

```json
{
  "from": "card-id-1",
  "to": "card-id-2",
  "label": ""
}
```

Connections draw a line between two cards. `label` is optional (currently unused but reserved).

## Layout Best Practices

### Spacing
- **Horizontal gap between cards:** 50-80px minimum
- **Vertical gap between cards:** 50-80px minimum
- **Row height:** Cards in a row should share the same `y` value
- **Column width:** Cards in a column should share the same `x` value

### Grouping Patterns

**Horizontal row (related items):**
```
Card A (x:100, y:100)  Card B (x:470, y:100)  Card C (x:840, y:100)
```
Formula: next card x = previous x + previous w + 50

**Vertical column (hierarchy/sequence):**
```
Card A (x:100, y:100)
Card B (x:100, y:350)
Card C (x:100, y:600)
```
Formula: next card y = previous y + previous h + 50

**Grid layout:**
```
A (100,100)   B (470,100)   C (840,100)
D (100,350)   E (470,350)   F (840,350)
```

**Hub and spoke (central concept + related):**
```
              B (400,50)
A (100,250)   CENTER (400,250)   C (700,250)
              D (400,450)
```

### Avoiding Overlaps

When adding cards to an existing canvas:
1. Read the existing `cards` array
2. Calculate the bounding box: `maxX = max(card.x + card.w)`, `maxY = max(card.y + card.h)`
3. Place new cards BELOW the existing ones: start at `y = maxY + 100`
4. Or place to the RIGHT: start at `x = maxX + 100`

**Safe insertion formula:**
```python
existing_cards = state["cards"]
if existing_cards:
    max_y = max(c["y"] + c["h"] for c in existing_cards)
    start_y = max_y + 100
else:
    start_y = 100

# Place new cards starting at (100, start_y)
```

### Sizing Guide

| Content Length | Recommended Size |
|---------------|-----------------|
| Title only (1-5 words) | w: 250, h: 100 |
| Short (1-2 lines) | w: 300, h: 150 |
| Medium (3-5 lines) | w: 320, h: 200 |
| Long (paragraph) | w: 400, h: 280 |
| Detailed (multiple paragraphs) | w: 450, h: 350 |
| List (5+ items) | w: 350, h: 300 |

### Color Coding Conventions

Use colors to create visual groupings:
- Same color = same category/group
- Different color = different category
- Coral/Peach for important/action items
- Mint/Sage for completed/reference items
- Lavender for creative/exploratory ideas
- Cream for general/default

## Example: Adding a Row of Cards

```json
{
  "cards": [
    {
      "id": "shape-1",
      "x": 100, "y": 100, "w": 350, "h": 250,
      "color": "#FFF8E7",
      "content": "# Shape 1: Display\n\nThe portfolio piece. \"This is who I am.\"\n\nArchitecture firms, therapists, lawyers."
    },
    {
      "id": "shape-2",
      "x": 500, "y": 100, "w": 350, "h": 250,
      "color": "#DBEAFE",
      "content": "# Shape 2: Event\n\n\"This thing is happening.\"\n\nWeddings, conferences, Airbnb stays."
    },
    {
      "id": "shape-3",
      "x": 900, "y": 100, "w": 350, "h": 250,
      "color": "#FFE8D6",
      "content": "# Shape 3: Communication\n\n\"This thing exists. Come look.\"\n\nProperty listings, book launches, fundraisers."
    }
  ],
  "connections": [
    { "from": "shape-1", "to": "shape-2", "label": "" },
    { "from": "shape-2", "to": "shape-3", "label": "" }
  ]
}
```

## Merging Cards from Another File

The canvas has a **Merge** button. To add cards without replacing existing ones:
1. Write your new cards to a separate JSON file (same format)
2. In the canvas, click **Merge** and pick your file
3. The new cards are added offset to the right of existing cards

**For programmatic merging:**
1. Read the existing canvas.json
2. Calculate safe placement (below or right of existing cards)
3. Append your new cards to the `cards` array
4. Append any new connections
5. Write the merged result back

**IMPORTANT:** Do not overwrite the file while the canvas app has it open — the app autosaves and will overwrite your changes. Either:
- Write to a separate file and use the Merge button
- Or coordinate: tell the user to stop editing, you write, they reload
