#!/usr/bin/env python3
"""Build a Tauri updater manifest from the final, platform-prefixed release assets."""
import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

REPOSITORY = "https://github.com/yue19870813/siming"
TARGETS = {
    "darwin-aarch64": ("macos-arm64-*.app.tar.gz",),
    "darwin-x86_64": ("macos-x64-*.app.tar.gz",),
    "windows-x86_64": ("windows-x64-*.exe", "windows-x64-*.msi"),
}


def manifest(assets: Path, version: str, notes: str = "") -> dict:
    if not re.fullmatch(r"\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?", version):
        raise ValueError("Invalid release version")
    platforms = {}
    for target, patterns in TARGETS.items():
        candidates = []
        for pattern in patterns:
            candidates = sorted(assets.glob(pattern))
            if candidates:
                break
        if len(candidates) != 1:
            raise ValueError(f"Expected one updater package for {target}, got {len(candidates)}")
        package = candidates[0]
        signature = package.with_name(package.name + ".sig").read_text().strip()
        if not signature:
            raise ValueError(f"Empty signature: {package.name}")
        platforms[target] = {
            "url": f"{REPOSITORY}/releases/download/v{version}/{quote(package.name, safe='')}",
            "signature": signature,
        }
    return {
        "version": version,
        "notes": notes,
        "pub_date": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "platforms": platforms,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("assets", type=Path)
    parser.add_argument("--version", required=True)
    parser.add_argument("--notes-file", type=Path)
    args = parser.parse_args()
    result = manifest(args.assets, args.version, args.notes_file.read_text() if args.notes_file else "")
    (args.assets / "latest.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
