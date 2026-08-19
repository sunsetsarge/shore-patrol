# Render one GLB at several camera angles and write a labeled montage, so the
# right angle is CHOSEN from pixels instead of guessed (handoff Rule 1).
# Usage: python render_candidates.py <name> "<elev,az,roll>" "<elev,az,roll>" ...
import subprocess, sys, os
from PIL import Image, ImageDraw

BLENDER = r"C:\Program Files\Blender Foundation\Blender 5.1\blender.exe"
HERE = os.path.dirname(os.path.abspath(__file__))
name = sys.argv[1]
angles = sys.argv[2:] or ["-25,0,0", "-25,180,0", "-40,0,0", "-10,0,0"]
glb = os.path.join(HERE, name + ".glb")
outdir = os.path.join(HERE, "renders_cand"); os.makedirs(outdir, exist_ok=True)

tiles = []
for a in angles:
    e, az, roll = [x.strip() for x in a.split(",")]
    out = os.path.join(outdir, f"{name}_{e}_{az}_{roll}.png")
    subprocess.run([BLENDER, "-b", "-P", os.path.join(HERE, "build_bomber_sprite.py"),
                    "--", glb, out, e, az, roll],
                   capture_output=True, text=True)
    if os.path.exists(out): tiles.append((a, out))
    print("rendered", a, os.path.exists(out), flush=True)

if tiles:
    cell = 300
    m = Image.new("RGBA", (cell*len(tiles), cell+24), (42,45,52,255))
    d = ImageDraw.Draw(m)
    for i,(a,pth) in enumerate(tiles):
        im = Image.open(pth).convert("RGBA"); im.thumbnail((cell-8,cell-8), Image.LANCZOS)
        m.alpha_composite(im, (i*cell+(cell-im.width)//2, (cell-im.height)//2))
        d.text((i*cell+8, cell+6), a, fill=(230,230,230,255))
    mp = os.path.join(HERE, "..", "shots", f"cand_{name}.png")
    m.save(mp); print("MONTAGE:", os.path.abspath(mp), flush=True)
