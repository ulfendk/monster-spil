#!/usr/bin/env python3
"""Prints HOW_TO_ADD_A_MONSTER.md to HOW_TO_ADD_A_MONSTER.pdf (A4) with headless Chromium.

    python3 scripts/make-guide-pdf.py

Handles just the Markdown the guide uses (headings, paragraphs, lists, code blocks,
`code`, **bold**, *italics*, ---). No Python packages needed; needs `chromium` on PATH.
"""
import html
import pathlib
import re
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "HOW_TO_ADD_A_MONSTER.md"
OUT = ROOT / "HOW_TO_ADD_A_MONSTER.pdf"

CSS = """@page{size:A4;margin:16mm}body{font-family:"Noto Sans","DejaVu Sans",sans-serif;font-size:12pt;line-height:1.45;color:#222}
h1{font-size:25pt;margin:0 0 5mm}h2{font-size:16pt;margin:7mm 0 2mm;break-after:avoid}ul{margin:2mm 0}li{margin:1mm 0}
.types{font-size:15pt;margin:3mm 0}pre{background:#f3f3f3;border:1px solid #ccc;padding:3.5mm;font-size:10pt;line-height:1.35;white-space:pre-wrap;break-inside:avoid}
code{font-family:"DejaVu Sans Mono",monospace;font-size:.92em;background:#f3f3f3;padding:0 1mm}pre code{background:none;padding:0}hr{border:0;border-top:1px solid #999;margin:7mm 0 3mm}em{color:#444}"""


def inline(text: str) -> str:
    text = html.escape(text)
    text = re.sub(r"`([^`]+)`", r"<code>\1</code>", text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", text)
    return re.sub(r"(?<![\w*])\*([^*]+)\*(?![\w*])", r"<em>\1</em>", text)


def to_html(lines: list[str]) -> str:
    out, i = [], 0
    while i < len(lines):
        line = lines[i]
        if line.startswith("```"):
            i += 1
            block = []
            while not lines[i].startswith("```"):
                block.append(lines[i])
                i += 1
            out.append("<pre><code>" + html.escape("\n".join(block)) + "</code></pre>")
            i += 1
        elif m := re.match(r"(#+) (.*)", line):
            out.append(f"<h{len(m[1])}>{inline(m[2])}</h{len(m[1])}>")
            i += 1
        elif line.startswith("- "):
            items = []
            while i < len(lines) and (lines[i].startswith("- ") or (lines[i].startswith("  ") and items)):
                if lines[i].startswith("- "):
                    items.append(lines[i][2:])
                else:
                    items[-1] += " " + lines[i].strip()
                i += 1
            out.append("<ul>" + "".join(f"<li>{inline(x)}</li>" for x in items) + "</ul>")
        elif line.strip() == "---":
            out.append("<hr>")
            i += 1
        elif not line.strip():
            i += 1
        else:
            para = [line]
            i += 1
            while i < len(lines) and lines[i].strip() and not re.match(r"(#|```|- |---)", lines[i]):
                para.append(lines[i])
                i += 1
            css_class = ' class="types"' if "🔥 Ild" in para[0] else ""
            out.append(f"<p{css_class}>" + inline(" ".join(para)) + "</p>")
    return "\n".join(out)


def main() -> None:
    body = to_html(SRC.read_text(encoding="utf-8").split("\n"))
    page = f'<!doctype html><html lang="da"><head><meta charset="utf-8"><title>Sådan laver du dit eget monster!</title><style>{CSS}</style></head><body>{body}</body></html>'
    with tempfile.TemporaryDirectory() as tmp:
        src = pathlib.Path(tmp) / "guide.html"
        src.write_text(page, encoding="utf-8")
        subprocess.run(
            ["chromium", "--headless", "--no-sandbox", "--disable-gpu", "--no-pdf-header-footer", f"--print-to-pdf={OUT}", src.as_uri()],
            check=True,
            capture_output=True,
        )
    print(f"wrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
