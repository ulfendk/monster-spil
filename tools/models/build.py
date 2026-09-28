"""
Builds the monsters' Blender models: every tools/models/monsters/<id>.py has a
`build() -> Model`, exported and then compressed with meshopt (gltf-transform: positions,
normals and colours quantized — colours to 12 bits, so the palette colours come back exact
enough to recolour — and packed) into <out>/<id>.glb. A model is rebuilt only when its script or
the shared lib/ changed (hashes in manifest.json), unless --force.

    blender --background --factory-startup --python build.py -- --out DIR [--only a,b] [--force] [--preview]
"""
import argparse
import hashlib
import importlib.util
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="/out", type=Path)
    ap.add_argument("--cache", default="/cache", type=Path)
    ap.add_argument("--manifest", default=str(HERE / "manifest.json"), type=Path)
    ap.add_argument("--only", default="")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--preview", action="store_true")
    args = ap.parse_args(argv)

    manifest = json.loads(args.manifest.read_text()) if args.manifest.exists() else {}
    shared = hashlib.sha1()
    for f in [HERE / "build.py", *sorted((HERE / "lib").glob("*.py"))]:
        shared.update(f.read_bytes())
    only = [m for m in args.only.split(",") if m]

    for script in sorted((HERE / "monsters").glob("*.py")):
        mid = script.stem
        if only and mid not in only:
            continue
        h = shared.copy()
        h.update(script.read_bytes())
        key = h.hexdigest()[:12]
        out = args.out / f"{mid}.glb"
        if manifest.get(mid, {}).get("hash") == key and out.exists() and not args.force and not args.preview:
            continue
        print(f"[models] {mid}", flush=True)
        spec = importlib.util.spec_from_file_location(f"monsters.{mid}", script)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        model = module.build()
        model.finish()
        raw = args.cache / "raw" / f"{mid}.glb"
        raw.parent.mkdir(parents=True, exist_ok=True)
        model.export(raw)
        subprocess.run(
            ["gltf-transform", "meshopt", str(raw), str(out), "--level", "high",
             "--quantization-volume", "scene", "--quantize-color", "12"],
            check=True, stdout=subprocess.DEVNULL,
        )
        stats = model.stats()
        manifest[mid] = {"hash": key, "file": out.name, **stats, "bytes": out.stat().st_size}
        args.manifest.write_text(json.dumps(manifest, indent=2) + "\n")
        print(f"[models]   {stats['tris']} triangles in {stats['parts']} parts, {out.stat().st_size // 1024} KB ({raw.stat().st_size // 1024} KB before compression)", flush=True)
        if args.preview:
            args.cache.mkdir(parents=True, exist_ok=True)
            for stage in (1, 2, 3):
                model.preview(args.cache / f"{mid}-{stage}.png", stage=stage)
            model.preview(args.cache / f"{mid}-talk.png", face="talk")
            model.preview(args.cache / f"{mid}-side.png", turn=-1.4)


if __name__ == "__main__":
    main()
