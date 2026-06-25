"""Compose a CC0 top-down 'Polis city block' backdrop from Kenney Roguelike
Modern City tiles. Outputs a single PNG sized to the Polis world (40x40 @16px).
View the output, tweak, then it becomes the Phaser backdrop. License: CC0.
"""
import os, random
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SHEET = os.path.join(HERE, "kenney_dl", "city", "Tilemap", "tilemap_packed.png")
OUT_REF = os.path.join(HERE, "..", ".ref", "polis_kenney_city.png")

S, COLS = 16, 37
GRID = 40  # 40x40 tiles -> 640x640, matches the Phaser world
sheet = Image.open(SHEET).convert("RGBA")

def tile(idx):
    c, r = idx % COLS, idx // COLS
    return sheet.crop((c * S, r * S, c * S + S, r * S + S))

# Confirmed tile indices
GRASS = [963, 926]
ROAD = 792
SIDEWALK = 778
TREES = [439, 440]
CARS = [661]
ROOF = 49           # grey roof-ish block for simple buildings
DOOR = 580
WINDOW = 272
TANWALL = 300

rng = random.Random(7)
canvas = Image.new("RGBA", (GRID * S, GRID * S), (60, 80, 50, 255))

def put(idx, gx, gy, flip=False):
    if not (0 <= gx < GRID and 0 <= gy < GRID):
        return
    t = tile(idx)
    if flip:
        t = t.transpose(Image.FLIP_LEFT_RIGHT)
    canvas.paste(t, (gx * S, gy * S), t)

occupied = [[False] * GRID for _ in range(GRID)]

# 1) Grass base (with slight variation)
for gy in range(GRID):
    for gx in range(GRID):
        put(GRASS[0] if rng.random() > 0.12 else GRASS[1], gx, gy)

# 2) Cross-street: horizontal band rows 18-20, vertical band cols 18-20,
#    each flanked by sidewalks.
def lay_road():
    for gy in range(GRID):
        for gx in range(GRID):
            h = 18 <= gy <= 20
            v = 18 <= gx <= 20
            if h or v:
                put(ROAD, gx, gy); occupied[gy][gx] = True
    # sidewalks alongside
    for gy in range(GRID):
        for gx in range(GRID):
            near_h = gy in (17, 21) and not (18 <= gx <= 20)
            near_v = gx in (17, 21) and not (18 <= gy <= 20)
            if (near_h or near_v):
                put(SIDEWALK, gx, gy); occupied[gy][gx] = True
lay_road()

# 3) Simple building blocks in the quadrants (roof + a door on the front edge).
def building(x0, y0, w, h):
    for yy in range(y0, y0 + h):
        for xx in range(x0, x0 + w):
            put(ROOF, xx, yy); occupied[yy][xx] = True
    # windows on the body, a door centered on the bottom edge
    for xx in range(x0 + 1, x0 + w - 1, 2):
        put(WINDOW, xx, y0 + 1)
    put(DOOR, x0 + w // 2, y0 + h - 1)

building(4, 4, 8, 6)
building(26, 4, 7, 7)
building(5, 26, 7, 6)
building(27, 27, 6, 6)

# 4) Trees scattered on free grass
placed = 0
for _ in range(220):
    if placed >= 60:
        break
    gx, gy = rng.randrange(GRID), rng.randrange(GRID)
    if not occupied[gy][gx]:
        put(rng.choice(TREES), gx, gy); occupied[gy][gx] = True; placed += 1

# 5) A few cars on the roads
for (gx, gy, flip) in [(12, 19, False), (25, 19, True), (19, 9, False), (19, 30, True)]:
    put(CARS[0], gx, gy, flip)

canvas.save(OUT_REF)
print("wrote", OUT_REF, canvas.size)
