#!/usr/bin/env python3
"""
Convert a Claude Code conversation transcript (JSONL) into a beautiful, readable HTML file.

Usage:
    python transcript-to-html.py <input.jsonl> [output.html]

If output path is not provided, writes to <input_basename>.html in the current directory.
"""

import json
import sys
import os
import re
import html
import hashlib
from datetime import datetime, timezone
from pathlib import Path


def parse_timestamp(ts_str):
    if not ts_str:
        return None
    try:
        ts_str = ts_str.replace("Z", "+00:00")
        return datetime.fromisoformat(ts_str)
    except (ValueError, TypeError):
        return None


def format_timestamp(ts):
    if not ts:
        return ""
    return ts.strftime("%H:%M")


def format_timestamp_full(ts):
    if not ts:
        return ""
    return ts.strftime("%Y-%m-%d %H:%M:%S UTC")


def format_date(ts):
    if not ts:
        return ""
    return ts.strftime("%B %d, %Y")


def make_file_link(text):
    """Convert file paths to clickable links."""
    def replace_path(match):
        path = match.group(0)
        # Don't linkify if already inside an href
        escaped = html.escape(path)
        url = "file://" + path.replace(" ", "%20")
        return f'<a href="{url}" class="file-link" title="Open in Finder">{escaped}</a>'
    return re.sub(r'/Users/[^\s<>"\')\]]+', replace_path, text)


def render_markdown(text):
    """Render markdown to HTML. Handles tags BEFORE escaping to avoid leaking."""
    if not text:
        return ""

    # FIRST: Handle special XML-like tags BEFORE HTML escaping
    # Extract and protect <llm> blocks
    llm_blocks = []
    def save_llm(m):
        idx = len(llm_blocks)
        llm_blocks.append(m.group(1))
        return f"__LLM_BLOCK_{idx}__"
    text = re.sub(r'<llm>(.*?)</llm>', save_llm, text, flags=re.DOTALL)

    # Extract and protect <teammate-message> blocks
    tm_blocks = []
    def save_tm(m):
        idx = len(tm_blocks)
        tm_blocks.append(m.group(1))
        return f"__TM_BLOCK_{idx}__"
    text = re.sub(r'<teammate-message[^>]*>(.*?)</teammate-message>', save_tm, text, flags=re.DOTALL)

    # Clean system tags
    text = re.sub(r'<local-command-caveat>.*?</local-command-caveat>', '', text, flags=re.DOTALL)
    text = re.sub(r'<local-command-stdout>(.*?)</local-command-stdout>', r'[output] \1', text, flags=re.DOTALL)
    text = re.sub(r'<command-name>(/\w+)</command-name>', r'Command: \1', text)
    text = re.sub(r'<command-message>.*?</command-message>', '', text, flags=re.DOTALL)
    text = re.sub(r'<command-args>.*?</command-args>', '', text, flags=re.DOTALL)
    text = re.sub(r'<system-reminder>.*?</system-reminder>', '', text, flags=re.DOTALL)
    # Clean task notifications — extract just the summary
    def clean_task_notification(m):
        body = m.group(1)
        summary_m = re.search(r'<summary>(.*?)</summary>', body, re.DOTALL)
        if summary_m:
            return f'[Task: {summary_m.group(1).strip()}]'
        return ''
    text = re.sub(r'<task-notification>(.*?)</task-notification>', clean_task_notification, text, flags=re.DOTALL)
    # Strip other internal XML tags that leak through
    text = re.sub(r'<tool-use-id>.*?</tool-use-id>', '', text, flags=re.DOTALL)
    text = re.sub(r'<output-file>.*?</output-file>', '', text, flags=re.DOTALL)
    text = re.sub(r'<persisted-output>.*?</persisted-output>', '', text, flags=re.DOTALL)
    text = re.sub(r'<available-deferred-tools>.*?</available-deferred-tools>', '', text, flags=re.DOTALL)
    text = re.sub(r'<user-prompt-submit-hook>.*?</user-prompt-submit-hook>', '', text, flags=re.DOTALL)

    # NOW escape HTML
    text = html.escape(text)

    # Code blocks (fenced)
    def replace_code_block(m):
        lang = m.group(1) or ""
        code = m.group(2)
        lang_label = f'<span class="code-lang">{lang}</span>' if lang else ""
        return f'<div class="code-wrapper">{lang_label}<pre class="code-block"><code>{code}</code></pre></div>'
    text = re.sub(r'```(\w*)\n(.*?)```', replace_code_block, text, flags=re.DOTALL)

    # Inline code
    text = re.sub(r'`([^`\n]+)`', r'<code class="ic">\1</code>', text)

    # Headers
    text = re.sub(r'^####\s+(.+)$', r'<h4>\1</h4>', text, flags=re.MULTILINE)
    text = re.sub(r'^###\s+(.+)$', r'<h3>\1</h3>', text, flags=re.MULTILINE)
    text = re.sub(r'^##\s+(.+)$', r'<h2>\1</h2>', text, flags=re.MULTILINE)
    text = re.sub(r'^#\s+(.+)$', r'<h1>\1</h1>', text, flags=re.MULTILINE)

    # Bold and italic
    text = re.sub(r'\*\*\*(.+?)\*\*\*', r'<strong><em>\1</em></strong>', text)
    text = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', text)
    text = re.sub(r'(?<!\w)\*(.+?)\*(?!\w)', r'<em>\1</em>', text)

    # Links
    text = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'<a href="\2" target="_blank">\1</a>', text)

    # Horizontal rules
    text = re.sub(r'^---+$', r'<hr>', text, flags=re.MULTILINE)

    # Tables
    def replace_table(m):
        table_text = m.group(0)
        rows = table_text.strip().split("\n")
        result = '<div class="table-wrap"><table>'
        for i, row in enumerate(rows):
            if re.match(r'^\s*\|[\s\-:|]+\|\s*$', row):
                continue
            cells = [c.strip() for c in row.split("|")[1:-1]]
            tag = "th" if i == 0 else "td"
            result += "<tr>" + "".join(f"<{tag}>{c}</{tag}>" for c in cells) + "</tr>"
        result += "</table></div>"
        return result
    text = re.sub(r'(\|.+\|(\n|$))+', replace_table, text)

    # Lists
    text = re.sub(r'^(\s*)-\s+(.+)$', r'\1<li>\2</li>', text, flags=re.MULTILINE)
    text = re.sub(r'((?:<li>.*?</li>\n?)+)', r'<ul>\1</ul>', text)

    # Paragraphs
    lines = text.split("\n")
    result = []
    in_pre = False
    for line in lines:
        if "<pre" in line or "<div class=\"code-wrapper\">" in line:
            in_pre = True
        if "</pre>" in line:
            in_pre = False
        if in_pre:
            result.append(line)
        elif line.strip() == "":
            result.append("")
        elif not re.match(r'^\s*<(h[1-6]|ul|li|pre|hr|table|div|/)', line):
            result.append(f"<p>{line}</p>")
        else:
            result.append(line)
    text = "\n".join(result)

    # Restore LLM blocks as styled blockquotes
    for i, block in enumerate(llm_blocks):
        escaped_block = html.escape(block)
        # Render basic markdown in the block
        escaped_block = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', escaped_block)
        escaped_block = re.sub(r'\n\n', '</p><p>', escaped_block)
        replacement = f'<blockquote class="llm-quote"><p>{escaped_block}</p></blockquote>'
        text = text.replace(f"__LLM_BLOCK_{i}__", replacement)
        # Also handle if it got wrapped in <p>
        text = text.replace(f"<p>__LLM_BLOCK_{i}__</p>", replacement)

    # Restore teammate blocks
    for i, block in enumerate(tm_blocks):
        escaped_block = html.escape(block)
        replacement = f'<div class="inline-tm">{escaped_block}</div>'
        text = text.replace(f"__TM_BLOCK_{i}__", replacement)
        text = text.replace(f"<p>__TM_BLOCK_{i}__</p>", replacement)

    # File path links
    text = make_file_link(text)

    return text


def detect_teammate_messages(text):
    pattern = r'<teammate-message\s+([^>]*)>(.*?)</teammate-message>'
    matches = re.findall(pattern, text, re.DOTALL)
    results = []
    for attrs_str, body in matches:
        attrs = {}
        for m in re.finditer(r'(\w+)="([^"]*)"', attrs_str):
            attrs[m.group(1)] = m.group(2)
        results.append({"attrs": attrs, "body": body.strip()})
    return results


def content_hash(text):
    """Hash the first 200 chars of text for dedup."""
    return hashlib.md5(text[:200].encode()).hexdigest()


def process_jsonl(filepath):
    entries = []
    seen_hashes = set()

    with open(filepath, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                data = json.loads(line)
            except json.JSONDecodeError:
                continue

            entry_type = data.get("type")
            timestamp = parse_timestamp(data.get("timestamp"))

            if entry_type in ("file-history-snapshot", "progress"):
                continue

            message = data.get("message", {})
            if not message:
                continue

            role = message.get("role", "")
            content = message.get("content", "")
            model = message.get("model", "")
            uuid = data.get("uuid", "")
            team_name = data.get("teamName", "")
            is_error = data.get("isApiErrorMessage", False)
            is_meta = data.get("isMeta", False)
            tool_use_result_data = data.get("toolUseResult")

            entry = {
                "role": role,
                "timestamp": timestamp,
                "uuid": uuid,
                "model": model,
                "team_name": team_name,
                "is_error": is_error,
                "is_meta": is_meta,
                "text_parts": [],
                "tool_uses": [],
                "tool_results": [],
                "has_thinking": False,
                "teammate_messages": [],
                "tool_use_result_data": tool_use_result_data,
            }

            if isinstance(content, str):
                entry["text_parts"].append(content)
                tm = detect_teammate_messages(content)
                if tm:
                    entry["teammate_messages"] = tm
            elif isinstance(content, list):
                for block in content:
                    if not isinstance(block, dict):
                        continue
                    btype = block.get("type")
                    if btype == "text":
                        entry["text_parts"].append(block.get("text", ""))
                    elif btype == "tool_use":
                        entry["tool_uses"].append(block)
                    elif btype == "tool_result":
                        entry["tool_results"].append(block)
                    elif btype == "thinking":
                        entry["has_thinking"] = True

            text_content = "\n".join(entry["text_parts"]).strip()

            if (not text_content and not entry["tool_uses"]
                    and not entry["tool_results"] and not entry["has_thinking"]):
                continue

            # Skip meta wrappers
            if is_meta:
                cleaned = re.sub(r'<local-command-caveat>.*?</local-command-caveat>', '', text_content, flags=re.DOTALL).strip()
                if not cleaned:
                    continue

            # Dedup: skip if we've seen nearly identical content from same role recently
            if text_content and role == "user" and len(text_content) > 100:
                h = content_hash(text_content)
                if h in seen_hashes:
                    continue
                seen_hashes.add(h)

            entries.append(entry)

    return entries


def merge_entries(entries):
    merged = []
    i = 0
    while i < len(entries):
        entry = entries[i]
        if entry["role"] == "assistant":
            combined = dict(entry)
            combined["text_parts"] = list(entry["text_parts"])
            combined["tool_uses"] = list(entry["tool_uses"])
            combined["tool_results"] = list(entry["tool_results"])
            combined["teammate_messages"] = list(entry["teammate_messages"])

            j = i + 1
            while j < len(entries) and entries[j]["role"] == "assistant":
                next_e = entries[j]
                combined["text_parts"].extend(next_e["text_parts"])
                combined["tool_uses"].extend(next_e["tool_uses"])
                combined["tool_results"].extend(next_e["tool_results"])
                if next_e["has_thinking"]:
                    combined["has_thinking"] = True
                combined["teammate_messages"].extend(next_e["teammate_messages"])
                j += 1
            merged.append(combined)
            i = j
        else:
            merged.append(entry)
            i += 1
    return merged


def render_tool_use(tool_use):
    name = tool_use.get("name", "Unknown")
    inp = tool_use.get("input", {})

    # Tool-specific summaries
    summary = ""
    if isinstance(inp, dict):
        if name in ("Read", "Write", "Edit"):
            fp = inp.get("file_path", "")
            summary = fp.split("/")[-1] if "/" in fp else fp
        elif name == "Bash":
            summary = inp.get("description", "") or inp.get("command", "")[:80]
        elif name == "Glob":
            summary = inp.get("pattern", "")
        elif name == "Grep":
            summary = f'"{inp.get("pattern", "")}"'
        elif name == "SendMessage":
            summary = f'to {inp.get("to", "")}'
        elif name == "WebSearch":
            summary = inp.get("query", "")
        else:
            for k, v in list(inp.items())[:1]:
                if isinstance(v, str) and len(v) < 80:
                    summary = v

    safe_name = html.escape(name)
    safe_summary = html.escape(summary)[:120]
    safe_input = html.escape(json.dumps(inp, indent=2, ensure_ascii=False))

    # Truncate huge inputs
    if len(safe_input) > 2000:
        safe_input = safe_input[:2000] + "\n... (truncated)"

    return f'''<details class="tool-block">
<summary class="tool-summary-line"><span class="tool-name">{safe_name}</span><span class="tool-detail">{safe_summary}</span></summary>
<pre class="tool-pre">{safe_input}</pre>
</details>'''


def render_tool_result(tr, extra=None):
    content = tr.get("content", "")
    is_error = tr.get("is_error", False)

    if isinstance(content, str):
        display = content
    elif isinstance(content, list):
        display = "\n".join(
            b.get("text", str(b)) if isinstance(b, dict) else str(b) for b in content
        )
    else:
        display = str(content)

    if extra and isinstance(extra, dict):
        if "stdout" in extra:
            stdout = extra.get("stdout", "")
            stderr = extra.get("stderr", "")
            if stdout:
                display = stdout
            if stderr:
                display += f"\n[stderr]: {stderr}"

    if len(display) > 2000:
        display = display[:2000] + "\n... (truncated)"

    safe = html.escape(display)
    preview = html.escape(display.replace("\n", " ")[:60])
    err_class = " tool-err" if is_error else ""

    return f'''<details class="tool-block tool-result{err_class}">
<summary class="tool-summary-line"><span class="tool-name">Result</span><span class="tool-detail">{preview}</span></summary>
<pre class="tool-pre">{safe}</pre>
</details>'''


def build_toc(entries):
    items = []
    n = 0
    for entry in entries:
        if entry["role"] == "user" and not entry.get("is_meta"):
            text = "\n".join(entry["text_parts"]).strip()
            text = re.sub(r'<[^>]+>', '', text)
            # Skip tool-result-only user messages
            if not text and entry["tool_results"]:
                continue
            if not text:
                continue
            n += 1
            preview = text[:100].replace("\n", " ").strip()
            if len(text) > 100:
                preview += "..."
            items.append({
                "id": entry["uuid"] or f"msg-{n}",
                "preview": preview,
                "ts": format_timestamp(entry["timestamp"]),
                "n": n,
            })
    return items


def generate_html(entries, toc, source):
    user_ct = sum(1 for e in entries if e["role"] == "user")
    asst_ct = sum(1 for e in entries if e["role"] == "assistant")
    tool_ct = sum(len(e["tool_uses"]) for e in entries)

    first_ts = next((e["timestamp"] for e in entries if e["timestamp"]), None)
    last_ts = None
    for e in reversed(entries):
        if e["timestamp"]:
            last_ts = e["timestamp"]
            break

    duration = ""
    if first_ts and last_ts:
        delta = last_ts - first_ts
        hours = int(delta.total_seconds() // 3600)
        mins = int((delta.total_seconds() % 3600) // 60)
        if hours:
            duration = f"{hours}h {mins}m"
        else:
            duration = f"{mins}m"

    # TOC HTML
    toc_html = ""
    for item in toc:
        safe = html.escape(item["preview"])
        toc_html += f'<a href="#{item["id"]}" class="toc-item"><span class="toc-n">{item["n"]}</span><span class="toc-text">{safe}</span><span class="toc-ts">{item["ts"]}</span></a>\n'

    # Messages
    msgs_html = ""
    user_n = 0
    prev_date = ""

    for entry in entries:
        role = entry["role"]
        ts = format_timestamp(entry["timestamp"])
        ts_full = format_timestamp_full(entry["timestamp"])
        uuid = entry["uuid"]
        team = entry.get("team_name", "")
        is_error = entry.get("is_error", False)
        text = "\n".join(entry["text_parts"]).strip()
        tool_uses = entry.get("tool_uses", [])
        tool_results_list = entry.get("tool_results", [])
        has_thinking = entry.get("has_thinking", False)
        teammate_msgs = entry.get("teammate_messages", [])
        tool_use_result_data = entry.get("tool_use_result_data")

        # Date separator
        if entry["timestamp"]:
            date_str = format_date(entry["timestamp"])
            if date_str != prev_date:
                msgs_html += f'<div class="date-sep"><span>{date_str}</span></div>\n'
                prev_date = date_str

        # Determine type
        if role == "user":
            if teammate_msgs:
                # Filter out idle notifications
                real_msgs = [tm for tm in teammate_msgs if '"type":"idle_notification"' not in tm["body"]]
                if not real_msgs and not text.replace(re.sub(r'<teammate-message[^>]*>.*?</teammate-message>', '', text, flags=re.DOTALL), '').strip():
                    # Only idle notifications, skip entirely
                    if not tool_results_list:
                        continue
                msg_type = "teammate"
            elif entry.get("is_meta"):
                msg_type = "system"
            else:
                msg_type = "human"
                user_n += 1
        elif role == "assistant":
            msg_type = "error" if is_error else "assistant"
        else:
            msg_type = "other"

        anchor = f' id="{uuid}"' if uuid else ""

        # Build role label
        if msg_type == "human":
            label = f'<span class="label label-human">Jonathan</span>'
        elif msg_type == "assistant":
            label = '<span class="label label-asst">Claude</span>'
            if team:
                label += f' <span class="team-tag">{html.escape(team)}</span>'
        elif msg_type == "teammate":
            tm_id = teammate_msgs[0]["attrs"].get("teammate_id", "teammate") if teammate_msgs else "teammate"
            label = f'<span class="label label-tm">{html.escape(tm_id)}</span>'
        elif msg_type == "error":
            label = '<span class="label label-err">Error</span>'
        elif msg_type == "system":
            label = '<span class="label label-sys">System</span>'
        else:
            label = f'<span class="label">{role}</span>'

        # Content
        content = ""

        if has_thinking:
            content += '<div class="thinking">Thinking...</div>\n'

        # Text content
        if text:
            if msg_type == "teammate" and teammate_msgs:
                for tm in teammate_msgs:
                    if '"type":"idle_notification"' in tm["body"]:
                        continue
                    tm_id = tm["attrs"].get("teammate_id", "")
                    tm_summary = tm["attrs"].get("summary", "")
                    body = render_markdown(tm["body"])
                    content += f'<div class="tm-content">'
                    if tm_summary:
                        content += f'<div class="tm-summary">{html.escape(tm_summary)}</div>'
                    content += f'{body}</div>\n'
            else:
                content += f'<div class="msg-text">{render_markdown(text)}</div>\n'

        # Tool calls — grouped as a single collapsible section if multiple
        if tool_uses:
            if len(tool_uses) == 1:
                content += render_tool_use(tool_uses[0]) + "\n"
            else:
                inner = "".join(render_tool_use(tu) for tu in tool_uses)
                content += f'<details class="tool-group"><summary class="tool-summary-line"><span class="tool-name">{len(tool_uses)} tool calls</span></summary>{inner}</details>\n'

        # Tool results
        for tr in tool_results_list:
            content += render_tool_result(tr, tool_use_result_data) + "\n"

        if not content.strip():
            continue

        # Skip system messages that are just "/login" etc
        if msg_type == "system" and len(text) < 30:
            continue

        msgs_html += f'''<article class="msg msg-{msg_type}" data-type="{msg_type}"{anchor}>
<header class="msg-head"><span class="msg-head-left">{label}</span><button class="msg-hide" onclick="hideMsg(this)" title="Hide this message">hide</button><time title="{ts_full}">{ts}</time></header>
<div class="msg-body">{content}</div>
</article>\n'''

    # Count message types for filter bar
    type_counts = {}
    for entry in entries:
        role = entry["role"]
        tms = entry.get("teammate_messages", [])
        is_err = entry.get("is_error", False)
        if role == "user":
            if tms:
                t = "teammate"
            elif entry.get("is_meta"):
                t = "system"
            else:
                t = "human"
        elif role == "assistant":
            t = "error" if is_err else "assistant"
        else:
            t = "other"
        type_counts[t] = type_counts.get(t, 0) + 1

    return f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Conversation Transcript</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Literata:ital,opsz,wght@0,7..72,300;0,7..72,400;0,7..72,500;0,7..72,600;0,7..72,700;1,7..72,400&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
*,*::before,*::after {{ box-sizing: border-box; margin: 0; padding: 0; }}

:root {{
  /* Moleskine / warm paper palette */
  --bg: #F6F3ED;
  --paper: #FFFEF9;
  --ink: #2C2C2C;
  --ink-soft: #555249;
  --ink-faint: #8C8578;
  --ink-ghost: #B5AFA4;
  --rule: #DDD8CE;
  --rule-light: #EAE6DE;

  --human-accent: #3B5998;
  --human-bg: #F0F3FA;
  --human-border: #C5D0E6;

  --asst-accent: #CC785C;
  --asst-bg: transparent;

  --tm-accent: #8B6914;
  --tm-bg: #FBF7ED;
  --tm-border: #E8DFC8;

  --err-accent: #B91C1C;
  --err-bg: #FEF2F2;

  --tool-bg: #F3F1EB;
  --tool-border: #DDD8CE;
  --code-bg: #F0EDE6;

  --serif: 'Literata', Georgia, 'Times New Roman', serif;
  --sans: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --mono: 'JetBrains Mono', 'SF Mono', Menlo, monospace;

  --max-w: 720px;
  --gutter: 28px;
}}

html {{ scroll-behavior: smooth; -webkit-font-smoothing: antialiased; }}

body {{
  background: var(--bg);
  color: var(--ink);
  font-family: var(--serif);
  font-size: 16.5px;
  line-height: 1.7;
  font-weight: 400;
  font-optical-sizing: auto;
}}

a {{ color: var(--human-accent); text-decoration: none; }}
a:hover {{ text-decoration: underline; }}

/* ─── Header ─── */
.page-header {{
  background: var(--paper);
  border-bottom: 1px solid var(--rule);
  padding: 52px var(--gutter) 44px;
}}
.page-header-inner {{
  max-width: var(--max-w);
  margin: 0 auto;
}}
.page-title {{
  font-family: var(--serif);
  font-size: 26px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--ink);
  margin-bottom: 14px;
}}
.page-meta {{
  font-family: var(--sans);
  font-size: 12px;
  color: var(--ink-faint);
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
}}
.page-meta strong {{ color: var(--ink-soft); font-weight: 500; }}

/* ─── Filter Bar ─── */
.filter-bar {{
  position: sticky;
  top: 0;
  z-index: 150;
  background: var(--paper);
  border-bottom: 1px solid var(--rule);
  padding: 10px var(--gutter);
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  box-shadow: 0 1px 4px rgba(0,0,0,0.04);
}}
.filter-bar-inner {{
  max-width: var(--max-w);
  margin: 0 auto;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}}
.filter-label {{
  font-family: var(--sans);
  font-size: 11px;
  font-weight: 500;
  color: var(--ink-ghost);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-right: 4px;
  flex-shrink: 0;
}}

.filter-pill {{
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 20px;
  border: 1px solid var(--rule);
  background: var(--paper);
  cursor: pointer;
  font-family: var(--sans);
  font-size: 12px;
  font-weight: 500;
  color: var(--ink-soft);
  transition: all 0.15s ease;
  user-select: none;
  -webkit-user-select: none;
}}
.filter-pill:hover {{
  border-color: var(--ink-ghost);
}}
.filter-pill.active {{
  background: var(--ink);
  color: var(--paper);
  border-color: var(--ink);
}}
.filter-pill .pill-dot {{
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}}
.filter-pill .pill-count {{
  font-size: 10px;
  opacity: 0.6;
  font-weight: 400;
}}
.filter-pill.active .pill-dot {{
  background: var(--paper) !important;
}}

.filter-sep {{
  width: 1px;
  height: 18px;
  background: var(--rule);
  margin: 0 4px;
  flex-shrink: 0;
}}

/* ─── TOC Toggle ─── */
.toc-toggle {{
  position: fixed;
  top: 60px;
  right: 16px;
  z-index: 200;
  background: var(--paper);
  color: var(--ink-soft);
  border: 1px solid var(--rule);
  padding: 7px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-family: var(--sans);
  font-size: 12px;
  font-weight: 500;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  transition: all 0.15s ease;
}}
.toc-toggle:hover {{
  background: var(--ink);
  color: var(--paper);
  border-color: var(--ink);
}}

/* ─── TOC Panel ─── */
.toc-panel {{
  position: fixed;
  top: 0; right: -420px;
  width: 420px;
  height: 100vh;
  background: var(--paper);
  border-left: 1px solid var(--rule);
  overflow-y: auto;
  z-index: 300;
  transition: right 0.25s ease;
  padding: 24px;
  box-shadow: -4px 0 20px rgba(0,0,0,0.08);
}}
.toc-panel.open {{ right: 0; }}
.toc-panel-head {{
  font-family: var(--sans);
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--rule);
  display: flex;
  justify-content: space-between;
  align-items: center;
}}
.toc-close {{
  background: none; border: none; cursor: pointer;
  font-size: 18px; color: var(--ink-faint); padding: 4px;
}}
.toc-close:hover {{ color: var(--ink); }}
.toc-item {{
  display: flex;
  gap: 10px;
  padding: 7px 10px;
  border-radius: 5px;
  font-family: var(--sans);
  font-size: 12px;
  line-height: 1.4;
  color: var(--ink-soft);
  text-decoration: none;
  align-items: baseline;
}}
.toc-item:hover {{ background: var(--bg); text-decoration: none; }}
.toc-n {{
  color: var(--ink-faint);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  min-width: 22px;
  flex-shrink: 0;
}}
.toc-text {{
  flex: 1;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}}
.toc-ts {{
  color: var(--ink-ghost);
  flex-shrink: 0;
  font-size: 10px;
  font-family: var(--mono);
}}

/* ─── Overlay ─── */
.toc-overlay {{
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.12);
  z-index: 250;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.25s;
}}
.toc-overlay.visible {{ opacity: 1; pointer-events: all; }}

/* ─── Messages ─── */
.messages {{
  max-width: var(--max-w);
  margin: 0 auto;
  padding: 24px var(--gutter) 80px;
}}

.date-sep {{
  text-align: center;
  margin: 44px 0 28px;
  position: relative;
}}
.date-sep::before {{
  content: '';
  position: absolute;
  left: 0; right: 0; top: 50%;
  border-top: 1px solid var(--rule-light);
}}
.date-sep span {{
  background: var(--bg);
  padding: 0 16px;
  font-family: var(--sans);
  font-size: 11px;
  font-weight: 500;
  color: var(--ink-ghost);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  position: relative;
}}

/* Individual message */
.msg {{
  margin-bottom: 4px;
  padding: 20px 28px 18px;
  border-radius: 10px;
  border: 1px solid transparent;
  position: relative;
  transition: opacity 0.2s ease, max-height 0.3s ease;
}}
.msg.hidden-msg {{
  display: none;
}}

.msg-head {{
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}}
.msg-head time {{
  font-family: var(--mono);
  font-size: 10px;
  color: var(--ink-ghost);
}}
.msg-head-left {{
  display: flex;
  align-items: center;
  gap: 6px;
}}

.label {{
  font-family: var(--sans);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 2px 8px;
  border-radius: 3px;
}}
.label-human {{ color: var(--human-accent); background: var(--human-bg); }}
.label-asst {{ color: var(--asst-accent); background: #FFF5F0; }}
.label-tm {{ color: var(--tm-accent); background: var(--tm-bg); }}
.label-err {{ color: var(--err-accent); background: var(--err-bg); }}
.label-sys {{ color: var(--ink-faint); background: var(--rule-light); }}

.team-tag {{
  font-family: var(--sans);
  font-size: 10px;
  color: var(--ink-faint);
  background: var(--rule-light);
  padding: 1px 6px;
  border-radius: 3px;
  margin-left: 2px;
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
}}

/* Per-message hide button */
.msg-hide {{
  opacity: 0;
  background: none;
  border: none;
  cursor: pointer;
  font-family: var(--sans);
  font-size: 10px;
  color: var(--ink-ghost);
  padding: 2px 6px;
  border-radius: 3px;
  transition: opacity 0.15s, color 0.1s;
  margin-left: auto;
  margin-right: 8px;
}}
.msg:hover .msg-hide {{
  opacity: 1;
}}
.msg-hide:hover {{
  color: var(--ink-soft);
  background: var(--rule-light);
}}

/* Message types */
.msg-human {{
  background: var(--paper);
  border-color: var(--human-border);
  box-shadow: 0 1px 2px rgba(0,0,0,0.03);
}}
.msg-assistant {{
  background: transparent;
  border-color: transparent;
  padding-left: 28px;
  padding-right: 28px;
}}
.msg-teammate {{
  background: var(--tm-bg);
  border-color: var(--tm-border);
}}
.msg-error {{
  background: var(--err-bg);
  border: 1px solid #FECACA;
}}
.msg-system {{
  background: var(--rule-light);
  opacity: 0.6;
  font-size: 14px;
}}

/* Text content */
.msg-text p {{ margin: 0 0 14px; }}
.msg-text p:last-child {{ margin-bottom: 0; }}
.msg-text h1 {{ font-size: 21px; margin: 24px 0 10px; font-weight: 600; }}
.msg-text h2 {{
  font-size: 18px;
  margin: 28px 0 10px;
  font-weight: 600;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--rule);
}}
.msg-text h3 {{ font-size: 16.5px; margin: 20px 0 8px; font-weight: 600; }}
.msg-text h4 {{ font-size: 14px; margin: 16px 0 6px; font-weight: 600; font-family: var(--sans); text-transform: uppercase; letter-spacing: 0.03em; color: var(--ink-soft); }}
.msg-text strong {{ font-weight: 600; }}
.msg-text em {{ font-style: italic; }}
.msg-text ul {{ margin: 10px 0; padding-left: 24px; }}
.msg-text li {{ margin: 5px 0; }}
.msg-text hr {{ border: none; border-top: 1px solid var(--rule); margin: 24px 0; }}

.msg-text blockquote {{
  border-left: 3px solid var(--ink-ghost);
  padding: 14px 20px;
  margin: 14px 0;
  color: var(--ink-soft);
  background: var(--rule-light);
  border-radius: 0 6px 6px 0;
  font-size: 15px;
}}

.llm-quote {{
  border-left-color: #7C3AED !important;
  background: #F5F3FF !important;
  font-size: 15px;
}}
.llm-quote p {{ margin: 0 0 8px; }}
.llm-quote p:last-child {{ margin: 0; }}

.inline-tm {{
  background: var(--tm-bg);
  border-left: 3px solid var(--tm-accent);
  padding: 10px 16px;
  margin: 10px 0;
  border-radius: 0 6px 6px 0;
  font-size: 15px;
}}

/* Code */
.code-wrapper {{
  position: relative;
  margin: 14px 0;
}}
.code-lang {{
  position: absolute;
  top: 6px; right: 10px;
  font-family: var(--mono);
  font-size: 9px;
  color: var(--ink-faint);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}}
.code-block {{
  background: var(--code-bg);
  border: 1px solid var(--rule);
  border-radius: 6px;
  padding: 14px 16px;
  font-family: var(--mono);
  font-size: 12.5px;
  line-height: 1.6;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
}}
.code-block code {{ background: none; padding: 0; font-size: inherit; }}

.ic {{
  background: var(--code-bg);
  border: 1px solid var(--rule);
  padding: 1px 5px;
  border-radius: 3px;
  font-family: var(--mono);
  font-size: 0.85em;
}}

/* File links */
.file-link {{
  font-family: var(--mono);
  font-size: 0.85em;
  color: var(--human-accent);
  background: rgba(59,89,152,0.06);
  padding: 1px 4px;
  border-radius: 3px;
  word-break: break-all;
}}

/* Tables */
.table-wrap {{ overflow-x: auto; margin: 14px 0; }}
.table-wrap table {{
  border-collapse: collapse;
  font-size: 13.5px;
  font-family: var(--sans);
  width: 100%;
}}
.table-wrap th, .table-wrap td {{
  border: 1px solid var(--rule);
  padding: 8px 12px;
  text-align: left;
}}
.table-wrap th {{ background: var(--rule-light); font-weight: 600; }}

/* Thinking */
.thinking {{
  font-family: var(--sans);
  font-size: 12px;
  color: var(--ink-ghost);
  font-style: italic;
  padding: 2px 0 6px;
}}

/* Teammate content */
.tm-content {{
  border-left: 3px solid var(--tm-accent);
  padding: 6px 16px;
  margin: 6px 0;
}}
.tm-summary {{
  font-family: var(--sans);
  font-weight: 600;
  font-size: 13px;
  margin-bottom: 4px;
}}

/* ─── Tool blocks ─── */
.tool-block {{
  margin: 8px 0;
  border: 1px solid var(--tool-border);
  border-radius: 6px;
  overflow: hidden;
  background: var(--tool-bg);
}}
.tool-block[open] {{ background: var(--paper); }}

.tool-summary-line {{
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  font-family: var(--sans);
  font-size: 12px;
  cursor: pointer;
  list-style: none;
  color: var(--ink-soft);
}}
.tool-summary-line::-webkit-details-marker {{ display: none; }}
.tool-summary-line::before {{
  content: '>';
  font-family: var(--mono);
  font-size: 10px;
  color: var(--ink-ghost);
  transition: transform 0.15s;
  flex-shrink: 0;
}}
details[open] > .tool-summary-line::before {{ transform: rotate(90deg); }}

.tool-summary-line:hover {{ background: rgba(0,0,0,0.02); }}
.tool-name {{
  font-weight: 600;
  color: var(--ink-soft);
  flex-shrink: 0;
}}
.tool-detail {{
  color: var(--ink-faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  font-family: var(--mono);
  font-size: 11px;
}}

.tool-pre {{
  padding: 12px 16px;
  font-family: var(--mono);
  font-size: 11.5px;
  line-height: 1.5;
  background: var(--code-bg);
  border-top: 1px solid var(--tool-border);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 300px;
  overflow-y: auto;
}}

.tool-err .tool-name {{ color: var(--err-accent); }}

.tool-group {{
  margin: 8px 0;
  border: 1px solid var(--tool-border);
  border-radius: 6px;
  overflow: hidden;
}}
.tool-group > .tool-summary-line {{ background: var(--tool-bg); }}
.tool-group .tool-block {{ border-radius: 0; border-left: 0; border-right: 0; margin: 0; }}
.tool-group .tool-block:last-child {{ border-bottom: 0; }}

/* ─── Back to top ─── */
.btt {{
  position: fixed;
  bottom: 20px;
  right: 20px;
  background: var(--paper);
  color: var(--ink-soft);
  border: 1px solid var(--rule);
  width: 36px; height: 36px;
  border-radius: 50%;
  cursor: pointer;
  font-size: 14px;
  z-index: 100;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
  font-family: var(--sans);
}}
.btt.visible {{ opacity: 1; }}
.btt:hover {{ background: var(--ink); color: var(--paper); border-color: var(--ink); }}

/* ─── Responsive ─── */
@media (max-width: 768px) {{
  :root {{ --gutter: 16px; }}
  .msg {{ padding: 16px 18px 14px; }}
  .toc-panel {{ width: 100%; right: -100%; }}
  body {{ font-size: 15.5px; }}
  .filter-bar {{ padding: 8px var(--gutter); }}
  .filter-pill {{ font-size: 11px; padding: 3px 8px; }}
}}

/* ─── Print ─── */
@media print {{
  .toc-toggle, .toc-panel, .toc-overlay, .btt, .filter-bar, .msg-hide {{ display: none !important; }}
  .msg {{ break-inside: avoid; }}
  body {{ background: white; }}
}}
</style>
</head>
<body>

<div class="page-header">
  <div class="page-header-inner">
    <h1 class="page-title">Conversation Transcript</h1>
    <div class="page-meta">
      <span><strong>{user_ct}</strong> messages from Jonathan</span>
      <span><strong>{asst_ct}</strong> responses from Claude</span>
      <span><strong>{tool_ct}</strong> tool calls</span>
      {f'<span><strong>{duration}</strong> duration</span>' if duration else ''}
      {f'<span>{format_date(first_ts)}</span>' if first_ts else ''}
    </div>
  </div>
</div>

<div class="filter-bar">
  <div class="filter-bar-inner">
    <span class="filter-label">Show</span>
    <button class="filter-pill active" data-filter="human" onclick="toggleFilter('human', this)">
      <span class="pill-dot" style="background:var(--human-accent)"></span>
      Jonathan <span class="pill-count">{type_counts.get("human", 0)}</span>
    </button>
    <button class="filter-pill active" data-filter="assistant" onclick="toggleFilter('assistant', this)">
      <span class="pill-dot" style="background:var(--asst-accent)"></span>
      Claude <span class="pill-count">{type_counts.get("assistant", 0)}</span>
    </button>
    <button class="filter-pill active" data-filter="teammate" onclick="toggleFilter('teammate', this)">
      <span class="pill-dot" style="background:var(--tm-accent)"></span>
      Teammates <span class="pill-count">{type_counts.get("teammate", 0)}</span>
    </button>
    <button class="filter-pill active" data-filter="error" onclick="toggleFilter('error', this)">
      <span class="pill-dot" style="background:var(--err-accent)"></span>
      Errors <span class="pill-count">{type_counts.get("error", 0)}</span>
    </button>
    <div class="filter-sep"></div>
    <button class="toc-toggle" style="position:static;box-shadow:none;padding:4px 10px;font-size:12px;" onclick="toggleToc()">Contents</button>
  </div>
</div>

<div class="toc-overlay" onclick="toggleToc()"></div>
<div class="toc-panel">
  <div class="toc-panel-head">
    <span>Table of Contents ({len(toc)})</span>
    <button class="toc-close" onclick="toggleToc()">&times;</button>
  </div>
  {toc_html}
</div>

<div class="messages">
  {msgs_html}
</div>

<button class="btt" onclick="window.scrollTo({{top:0,behavior:'smooth'}})" aria-label="Back to top">&uarr;</button>

<script>
// ─── Filter system ───
const activeFilters = new Set(['human', 'assistant', 'teammate', 'error', 'system', 'other']);

function toggleFilter(type, btn) {{
  if (activeFilters.has(type)) {{
    activeFilters.delete(type);
    btn.classList.remove('active');
  }} else {{
    activeFilters.add(type);
    btn.classList.add('active');
  }}
  applyFilters();
}}

function applyFilters() {{
  document.querySelectorAll('.msg[data-type]').forEach(msg => {{
    const type = msg.dataset.type;
    if (activeFilters.has(type)) {{
      msg.classList.remove('hidden-msg');
    }} else {{
      msg.classList.add('hidden-msg');
    }}
  }});
}}

// Per-message hide
function hideMsg(el) {{
  const msg = el.closest('.msg');
  if (msg) msg.classList.add('hidden-msg');
}}

// ─── TOC ───
function toggleToc() {{
  document.querySelector('.toc-panel').classList.toggle('open');
  document.querySelector('.toc-overlay').classList.toggle('visible');
}}
document.querySelectorAll('.toc-item').forEach(a => {{
  a.addEventListener('click', () => toggleToc());
}});
document.addEventListener('keydown', e => {{
  if (e.key === 'Escape') {{
    document.querySelector('.toc-panel').classList.remove('open');
    document.querySelector('.toc-overlay').classList.remove('visible');
  }}
}});

// ─── Back to top ───
const btt = document.querySelector('.btt');
let ticking = false;
window.addEventListener('scroll', () => {{
  if (!ticking) {{
    requestAnimationFrame(() => {{
      btt.classList.toggle('visible', window.scrollY > 600);
      ticking = false;
    }});
    ticking = true;
  }}
}});
</script>
</body>
</html>'''


def main():
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <input.jsonl> [output.html]")
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) >= 3 else Path(input_path).stem + ".html"

    if not os.path.exists(input_path):
        print(f"Error: Input file not found: {input_path}")
        sys.exit(1)

    print(f"Parsing {input_path}...")
    entries = process_jsonl(input_path)
    print(f"  {len(entries)} entries (after dedup)")

    print("Merging assistant chunks...")
    entries = merge_entries(entries)
    print(f"  {len(entries)} display messages")

    print("Building TOC...")
    toc = build_toc(entries)
    print(f"  {len(toc)} user messages")

    print(f"Writing HTML to {output_path}...")
    h = generate_html(entries, toc, input_path)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(h)

    size_kb = os.path.getsize(output_path) / 1024
    print(f"Done! {output_path} ({size_kb:.0f} KB)")


if __name__ == "__main__":
    main()
