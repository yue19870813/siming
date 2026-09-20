#!/usr/bin/env python3
"""Collect only distributable assets; reject incomplete or ambiguous downloads."""
import argparse
import shutil
from pathlib import Path


GROUPS = {
    "desktop-windows-x64": {".msi", ".exe"},
    "desktop-macos-arm64": {".dmg"},
    "desktop-macos-x64": {".dmg"},
    "sdk": {".tgz", ".nupkg"},
}


def collect(source: Path, destination: Path) -> list[Path]:
    if destination.exists() and any(destination.iterdir()):
        raise ValueError("Asset destination must be empty")
    planned = []
    names = set()
    for group, extensions in GROUPS.items():
        files = sorted(
            path for path in (source / group).rglob("*")
            if path.is_file() and path.suffix.lower() in extensions
            and not any(part.lower().endswith(".app") for part in path.parts)
        )
        if not files:
            raise ValueError(f"Missing release assets: {group}")
        if group == "sdk":
            if sum(p.suffix == ".tgz" for p in files) != 1 or sum(p.suffix == ".nupkg" for p in files) != 2:
                raise ValueError("SDK must contain one UPM tarball and two NuGet packages")
        for path in files:
            # Include the platform even when Tauri uses the same installer filename.
            name = path.name if group == "sdk" else f"{group.removeprefix('desktop-')}-{path.name}"
            if name.casefold() in names:
                raise ValueError(f"Duplicate release asset: {name}")
            names.add(name.casefold())
            planned.append((path, destination / name))
    destination.mkdir(parents=True, exist_ok=True)
    for source_file, target in planned:
        shutil.copy2(source_file, target)
        print(target.name)
    return [target for _, target in planned]


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    collect(args.source, args.destination)
