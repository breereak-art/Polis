"""Compose a clean top-down clinic floorplan backdrop for Polis (own art, CC0-safe).
640x640 to match the 40x40 @16px world; rooms aligned to agent desk positions.
"""
import os
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(__file__), "..", ".ref", "polis_clinic.png")
W = H = 640
img = Image.new("RGB", (W, H), "#e9eef2")
d = ImageDraw.Draw(img, "RGBA")

def font(sz):
    for p in ("C:/Windows/Fonts/segoeui.ttf", "C:/Windows/Fonts/arial.ttf"):
        if os.path.exists(p):
            return ImageFont.truetype(p, sz)
    return ImageFont.load_default()

# Subtle floor grid
for x in range(0, W, 16):
    d.line([(x, 0), (x, H)], fill=(255, 255, 255, 60))
for y in range(0, H, 16):
    d.line([(0, y), (W, y)], fill=(255, 255, 255, 60))

def room(x0, y0, x1, y1, fill, border, label, accent):
    d.rounded_rectangle([x0, y0, x1, y1], radius=10, fill=fill, outline=border, width=3)
    # label chip
    f = font(13)
    tw = d.textlength(label, font=f)
    d.rounded_rectangle([x0 + 8, y0 + 8, x0 + 16 + tw, y0 + 28], radius=6, fill=accent)
    d.text((x0 + 12, y0 + 11), label, font=f, fill="#ffffff")

def desk(cx, cy):
    d.rounded_rectangle([cx - 16, cy - 9, cx + 16, cy + 9], radius=3, fill="#c79a6b", outline="#9c7548", width=2)
    d.rectangle([cx - 7, cy - 5, cx + 7, cy + 5], fill="#3a3f55")  # monitor

def bed(cx, cy):
    d.rounded_rectangle([cx - 14, cy - 9, cx + 14, cy + 9], radius=4, fill="#ffffff", outline="#b9c6cf", width=2)
    d.rounded_rectangle([cx - 12, cy - 7, cx - 4, cy + 7], radius=3, fill="#dce7ee")  # pillow

def plant(cx, cy):
    d.ellipse([cx - 6, cy - 6, cx + 6, cy + 6], fill="#5fae6b", outline="#3f8a4b", width=2)
    d.rectangle([cx - 3, cy + 5, cx + 3, cy + 11], fill="#a9714a")

# Rooms (px), aligned to agent desks: triage(80,128) diagnostic(80,256)
# cardiology(80,384) pharmacy(240,128) records(240,256) tyr(448,320)
room(24, 56, 200, 200, (253, 226, 228, 235), "#e98a93", "TRIAGE", "#e36c79")
room(24, 208, 200, 336, (226, 240, 251, 235), "#7fb4e0", "DIAGNOSTIC", "#4b90d0")
room(24, 344, 200, 472, (250, 222, 230, 235), "#e58aa6", "CARDIOLOGY", "#d8517f")
room(232, 56, 408, 200, (226, 246, 232, 235), "#7fcf99", "PHARMACY", "#46b06a")
room(232, 208, 408, 336, (253, 243, 223, 235), "#e6c878", "RECORDS", "#d2a73f")
room(420, 232, 600, 408, (232, 230, 251, 235), "#9a8ff0", "TYR · TRUST REGISTRY", "#6d4aff")

# Furniture per room (near each agent's spot)
bed(110, 150); plant(170, 80)
desk(110, 280); plant(170, 224)
bed(110, 408); plant(170, 360)
desk(300, 150); plant(372, 80)
desk(300, 280); plant(372, 224)

# Tyr emblem — white medical cross in an indigo disc
d.ellipse([496, 296, 540, 340], fill=(109, 74, 255, 230), outline="#ffffff", width=3)
cx, cy = 518, 318
d.rectangle([cx - 3, cy - 10, cx + 3, cy + 10], fill="#ffffff")
d.rectangle([cx - 10, cy - 3, cx + 10, cy + 3], fill="#ffffff")

# Title strip (subtle, bottom)
d.rounded_rectangle([200, 600, 440, 628], radius=8, fill=(20, 26, 40, 200))
d.text((218, 606), "POLIS · Medical District", font=font(13), fill="#cdd6e6")

img.save(OUT)
print("wrote", OUT, img.size)
