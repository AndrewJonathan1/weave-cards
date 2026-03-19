#!/usr/bin/env python3
"""
Render a canvas JSON file as a PNG image showing the card layout visually.

Usage: python render-canvas.py input.json output.png
"""

import json
import sys
import textwrap
from PIL import Image, ImageDraw, ImageFont

PADDING = 80          # padding around all cards
GRID_STEP = 100       # grid lines every N pixels
CARD_CORNER_RADIUS = 8
CARD_BORDER_COLOR = "#CCCCCC"
CARD_BORDER_WIDTH = 1
TEXT_PADDING = 12      # padding inside card for text
ID_FONT_SIZE = 10
BODY_FONT_SIZE = 13
HEADER_FONT_SIZE = 16
GAP_LABEL_COLOR = "#FF6666"
GRID_COLOR = "#E8E8E8"
RULER_COLOR = "#999999"
RULER_FONT_SIZE = 10
CONNECTION_COLOR = "#666666"
CONNECTION_WIDTH = 2


def load_font(size):
    """Try to load a nice font, fall back to default."""
    font_paths = [
        "/System/Library/Fonts/SFNSMono.ttf",
        "/System/Library/Fonts/Menlo.ttc",
        "/System/Library/Fonts/Monaco.dfont",
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/SFNSText.ttf",
        "/Library/Fonts/Arial.ttf",
    ]
    for path in font_paths:
        try:
            return ImageFont.truetype(path, size)
        except (OSError, IOError):
            continue
    return ImageFont.load_default()


def hex_to_rgb(hex_color):
    """Convert hex color to RGB tuple."""
    hex_color = hex_color.lstrip('#')
    return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))


def darken(rgb, factor=0.7):
    """Darken an RGB color."""
    return tuple(int(c * factor) for c in rgb)


def compute_bounds(cards):
    """Compute bounding box of all cards."""
    if not cards:
        return 0, 0, 800, 600
    min_x = min(c['x'] for c in cards)
    min_y = min(c['y'] for c in cards)
    max_x = max(c['x'] + c['w'] for c in cards)
    max_y = max(c['y'] + c['h'] for c in cards)
    return min_x, min_y, max_x, max_y


def draw_rounded_rect(draw, xy, fill, outline, radius, width=1):
    """Draw a rounded rectangle."""
    x0, y0, x1, y1 = xy
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def wrap_text(text, font, max_width, draw):
    """Wrap text to fit within max_width pixels."""
    lines = []
    for paragraph in text.split('\n'):
        if not paragraph.strip():
            lines.append('')
            continue
        # Estimate chars per line
        avg_char_width = draw.textlength('M', font=font)
        if avg_char_width == 0:
            avg_char_width = 8
        chars_per_line = max(10, int(max_width / avg_char_width))
        wrapped = textwrap.wrap(paragraph, width=chars_per_line)
        if not wrapped:
            lines.append('')
        else:
            lines.extend(wrapped)
    return lines


def strip_markdown(text):
    """Strip basic markdown formatting for display."""
    # Remove bold markers
    text = text.replace('**', '')
    # Remove italic markers (single *)
    result = []
    i = 0
    while i < len(text):
        if text[i] == '*' and (i == 0 or text[i-1] != '*') and (i+1 >= len(text) or text[i+1] != '*'):
            i += 1
            continue
        result.append(text[i])
        i += 1
    return ''.join(result)


def render_card_text(draw, card, offset_x, offset_y, fonts):
    """Render card content text inside the card."""
    x = card['x'] + offset_x + TEXT_PADDING
    y = card['y'] + offset_y + TEXT_PADDING
    max_w = card['w'] - 2 * TEXT_PADDING
    max_h = card['h'] - 2 * TEXT_PADDING
    text_color = "#333333"

    content = card.get('content', '')
    lines = content.split('\n')
    cursor_y = y

    for line in lines:
        if cursor_y - y > max_h - 14:
            # Out of space — draw ellipsis
            draw.text((x, cursor_y), "...", fill=text_color, font=fonts['body'])
            break

        stripped = line.strip()

        # Determine font based on markdown headers
        if stripped.startswith('# '):
            font = fonts['h1']
            text = strip_markdown(stripped[2:])
            line_height = HEADER_FONT_SIZE + 6
        elif stripped.startswith('## '):
            font = fonts['h2']
            text = strip_markdown(stripped[3:])
            line_height = BODY_FONT_SIZE + 5
        else:
            font = fonts['body']
            text = strip_markdown(stripped)
            line_height = BODY_FONT_SIZE + 4

        if not text:
            cursor_y += line_height // 2
            continue

        # Wrap if needed
        wrapped = wrap_text(text, font, max_w, draw)
        for wline in wrapped:
            if cursor_y - y > max_h - 14:
                draw.text((x, cursor_y), "...", fill=text_color, font=fonts['body'])
                return
            draw.text((x, cursor_y), wline, fill=text_color, font=font)
            cursor_y += line_height

    # Draw card ID in bottom-right corner
    id_text = card['id']
    id_font = fonts['id']
    id_bbox = draw.textbbox((0, 0), id_text, font=id_font)
    id_w = id_bbox[2] - id_bbox[0]
    id_x = card['x'] + offset_x + card['w'] - id_w - 6
    id_y = card['y'] + offset_y + card['h'] - (id_bbox[3] - id_bbox[1]) - 4
    draw.text((id_x, id_y), id_text, fill="#AAAAAA", font=id_font)


def find_gaps(cards):
    """Find horizontal and vertical gaps between adjacent cards."""
    gaps = []
    for i, a in enumerate(cards):
        for j, b in enumerate(cards):
            if i >= j:
                continue
            ax1, ay1, ax2, ay2 = a['x'], a['y'], a['x'] + a['w'], a['y'] + a['h']
            bx1, by1, bx2, by2 = b['x'], b['y'], b['x'] + b['w'], b['y'] + b['h']

            # Horizontal gap (a is left of b, vertically overlapping)
            if ax2 <= bx1:
                overlap_y_start = max(ay1, by1)
                overlap_y_end = min(ay2, by2)
                if overlap_y_end > overlap_y_start:
                    gap = bx1 - ax2
                    if 0 < gap < 500:
                        mid_y = (overlap_y_start + overlap_y_end) // 2
                        gaps.append(('h', ax2, mid_y, bx1, mid_y, gap))

            # Vertical gap (a is above b, horizontally overlapping)
            if ay2 <= by1:
                overlap_x_start = max(ax1, bx1)
                overlap_x_end = min(ax2, bx2)
                if overlap_x_end > overlap_x_start:
                    gap = by1 - ay2
                    if 0 < gap < 500:
                        mid_x = (overlap_x_start + overlap_x_end) // 2
                        gaps.append(('v', mid_x, ay2, mid_x, by1, gap))

    return gaps


def draw_connection(draw, cards_by_id, conn, offset_x, offset_y):
    """Draw a connection line between two cards."""
    from_card = cards_by_id.get(conn.get('from'))
    to_card = cards_by_id.get(conn.get('to'))
    if not from_card or not to_card:
        return

    # Center of each card
    fx = from_card['x'] + from_card['w'] // 2 + offset_x
    fy = from_card['y'] + from_card['h'] // 2 + offset_y
    tx = to_card['x'] + to_card['w'] // 2 + offset_x
    ty = to_card['y'] + to_card['h'] // 2 + offset_y

    draw.line([(fx, fy), (tx, ty)], fill=CONNECTION_COLOR, width=CONNECTION_WIDTH)

    # Arrowhead
    import math
    angle = math.atan2(ty - fy, tx - fx)
    arrow_len = 12
    arrow_angle = math.pi / 6
    ax1 = tx - arrow_len * math.cos(angle - arrow_angle)
    ay1 = ty - arrow_len * math.sin(angle - arrow_angle)
    ax2 = tx - arrow_len * math.cos(angle + arrow_angle)
    ay2 = ty - arrow_len * math.sin(angle + arrow_angle)
    draw.polygon([(tx, ty), (int(ax1), int(ay1)), (int(ax2), int(ay2))], fill=CONNECTION_COLOR)


def render_canvas(input_path, output_path):
    """Main render function."""
    with open(input_path, 'r') as f:
        data = json.load(f)

    cards = data.get('cards', [])
    connections = data.get('connections', [])

    if not cards:
        print("No cards found in JSON.")
        sys.exit(1)

    # Compute bounds
    min_x, min_y, max_x, max_y = compute_bounds(cards)

    # Offset so everything starts at PADDING,PADDING
    offset_x = PADDING - min_x
    offset_y = PADDING - min_y

    img_w = (max_x - min_x) + 2 * PADDING
    img_h = (max_y - min_y) + 2 * PADDING

    # Create image
    img = Image.new('RGB', (img_w, img_h), '#FFFFFF')
    draw = ImageDraw.Draw(img)

    # Load fonts
    fonts = {
        'id': load_font(ID_FONT_SIZE),
        'body': load_font(BODY_FONT_SIZE),
        'h1': load_font(HEADER_FONT_SIZE),
        'h2': load_font(BODY_FONT_SIZE + 1),
        'ruler': load_font(RULER_FONT_SIZE),
        'gap': load_font(ID_FONT_SIZE),
    }

    # Draw grid
    for gx in range(0, img_w, GRID_STEP):
        coord = gx - offset_x
        draw.line([(gx, 0), (gx, img_h)], fill=GRID_COLOR, width=1)
        if coord % 200 == 0:
            draw.text((gx + 2, 2), str(coord), fill=RULER_COLOR, font=fonts['ruler'])
    for gy in range(0, img_h, GRID_STEP):
        coord = gy - offset_y
        draw.line([(0, gy), (img_w, gy)], fill=GRID_COLOR, width=1)
        if coord % 200 == 0:
            draw.text((2, gy + 2), str(coord), fill=RULER_COLOR, font=fonts['ruler'])

    # Draw bounding box of all cards
    bb_x0 = min_x + offset_x - 4
    bb_y0 = min_y + offset_y - 4
    bb_x1 = max_x + offset_x + 4
    bb_y1 = max_y + offset_y + 4
    draw.rectangle([bb_x0, bb_y0, bb_x1, bb_y1], outline="#DDDDDD", width=2)
    bbox_label = f"Bounding box: {max_x - min_x} x {max_y - min_y} px"
    draw.text((bb_x0 + 4, bb_y0 - 14), bbox_label, fill=RULER_COLOR, font=fonts['ruler'])

    # Draw connections
    cards_by_id = {c['id']: c for c in cards}
    for conn in connections:
        draw_connection(draw, cards_by_id, conn, offset_x, offset_y)

    # Draw cards
    for card in cards:
        cx = card['x'] + offset_x
        cy = card['y'] + offset_y
        cw = card['w']
        ch = card['h']

        bg_color = hex_to_rgb(card.get('color', '#FFFFFF'))

        draw_rounded_rect(
            draw,
            [cx, cy, cx + cw, cy + ch],
            fill=bg_color,
            outline=CARD_BORDER_COLOR,
            radius=CARD_CORNER_RADIUS,
            width=CARD_BORDER_WIDTH,
        )

        render_card_text(draw, card, offset_x, offset_y, fonts)

    # Draw gap measurements
    gaps = find_gaps(cards)
    seen_gaps = set()
    for gap_info in gaps:
        direction, x1, y1, x2, y2, gap_px = gap_info
        # Deduplicate similar gaps
        key = (direction, round(gap_px, -1), round((x1+x2)//2, -2), round((y1+y2)//2, -2))
        if key in seen_gaps:
            continue
        seen_gaps.add(key)

        sx1 = x1 + offset_x
        sy1 = y1 + offset_y
        sx2 = x2 + offset_x
        sy2 = y2 + offset_y

        # Draw measurement line
        draw.line([(sx1, sy1), (sx2, sy2)], fill=GAP_LABEL_COLOR, width=1)

        # Draw end ticks
        if direction == 'h':
            draw.line([(sx1, sy1 - 4), (sx1, sy1 + 4)], fill=GAP_LABEL_COLOR, width=1)
            draw.line([(sx2, sy2 - 4), (sx2, sy2 + 4)], fill=GAP_LABEL_COLOR, width=1)
        else:
            draw.line([(sx1 - 4, sy1), (sx1 + 4, sy1)], fill=GAP_LABEL_COLOR, width=1)
            draw.line([(sx2 - 4, sy2), (sx2 + 4, sy2)], fill=GAP_LABEL_COLOR, width=1)

        # Label
        label = f"{gap_px}px"
        mid_x = (sx1 + sx2) // 2
        mid_y = (sy1 + sy2) // 2
        label_bbox = draw.textbbox((0, 0), label, font=fonts['gap'])
        lw = label_bbox[2] - label_bbox[0]
        lh = label_bbox[3] - label_bbox[1]
        # White background for readability
        draw.rectangle([mid_x - lw//2 - 2, mid_y - lh//2 - 1, mid_x + lw//2 + 2, mid_y + lh//2 + 1], fill='#FFFFFF')
        draw.text((mid_x - lw//2, mid_y - lh//2), label, fill=GAP_LABEL_COLOR, font=fonts['gap'])

    img.save(output_path, 'PNG')
    print(f"Rendered {len(cards)} cards to {output_path} ({img_w}x{img_h}px)")


if __name__ == '__main__':
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} input.json output.png")
        sys.exit(1)
    render_canvas(sys.argv[1], sys.argv[2])
