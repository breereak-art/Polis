"""Quick test render of a Polis 'city' using the PixelWorldBuilder generator.
Run from the Polis repo root: python tools/render_polis.py
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SKILL = os.path.join(HERE, "..", "pixel-agents-repo", "pixel_world_skill")
sys.path.insert(0, SKILL)

from generator import PixelWorld  # noqa: E402

OUT = os.path.join(HERE, "..", ".ref")
os.makedirs(OUT, exist_ok=True)

world = PixelWorld(seed=2026, theme="default", enable_evaluation=False)

# Force-generate a small cluster of chunks around the origin.
for cx in range(-1, 2):
    for cy in range(-1, 2):
        world.get_chunk(cx, cy)

# Spawn a few of our medical-district agents so the render has life.
world.spawn_agent("Tara", 4, 4, "calm triage lead", role="leader")
world.spawn_agent("Dax", 9, 5, "overconfident diagnostician", role="citizen")
world.spawn_agent("Cora", 6, 9, "careful cardiologist", role="builder")

world.step_simulation(6)

out_day = os.path.join(OUT, "polis_city_day.png")
world.render_image(center_wx=5, center_wy=5, view_radius_chunks=2, filename=out_day)
print("wrote", out_day)

# A night variant for mood comparison, if the API supports current_time.
try:
    out_night = os.path.join(OUT, "polis_city_night.png")
    world.render_image(center_wx=5, center_wy=5, view_radius_chunks=2,
                       filename=out_night, current_time="night")
    print("wrote", out_night)
except TypeError:
    pass

print("done")
