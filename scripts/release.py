#!/usr/bin/env python3
"""Validate and synchronize the version used by every distributable."""
from __future__ import annotations
import argparse, json, re, subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = ["Cargo.toml", "apps/desktop/src-tauri/tauri.conf.json", "sdks/csharp/Directory.Build.props", "sdks/csharp/Packages/dev.siming.sdk/package.json"]
SEMVER = re.compile(r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$")

def clean(version: str) -> str:
    version = version.strip()
    if not SEMVER.fullmatch(version): raise SystemExit(f"invalid SemVer: {version}")
    return version

def dirty() -> bool:
    return bool(subprocess.check_output(["git", "status", "--porcelain"], cwd=ROOT, text=True).strip())

def replacements(version: str) -> dict[str, str]:
    updates = {
      "Cargo.toml": re.sub(r'(?m)^(version\s*=\s*)"[^"]+"', rf'\1"{version}"', (ROOT/"Cargo.toml").read_text(), count=1),
      "apps/desktop/src-tauri/tauri.conf.json": json.dumps({**json.loads((ROOT/"apps/desktop/src-tauri/tauri.conf.json").read_text()), "version": version}, indent=2)+"\n",
      "sdks/csharp/Directory.Build.props": re.sub(r'(<Version>)[^<]+(</Version>)', rf'\g<1>{version}\g<2>', (ROOT/"sdks/csharp/Directory.Build.props").read_text(), count=1),
      "sdks/csharp/Packages/dev.siming.sdk/package.json": json.dumps({**json.loads((ROOT/"sdks/csharp/Packages/dev.siming.sdk/package.json").read_text()), "version": version}, indent=2)+"\n",
    }


    # Only update local workspace packages, retaining every registry dependency pin.
    packages = {
        "Cargo.lock": {"siming-cli", "siming-core", "siming-desktop", "siming-storage"},
        "sdks/csharp/tests/RustReference/Cargo.lock": {"siming-core"},
    }
    for path, names in packages.items():
        blocks = (ROOT / path).read_text().split("[[package]]")
        found = set()
        for index, block in enumerate(blocks[1:], 1):
            match = re.search(r'^name = "([^"]+)"$', block, re.MULTILINE)
            if match and match[1] in names and not re.search(r'^source = ', block, re.MULTILINE):
                blocks[index], count = re.subn(r'^version = "[^"]+"$', f'version = "{version}"', block, count=1, flags=re.MULTILINE)
                if count != 1: raise SystemExit(f"Missing package version in {path}: {match[1]}")
                found.add(match[1])
        if found != names: raise SystemExit(f"Missing workspace packages in {path}: {names - found}")
        updates[path] = "[[package]]".join(blocks)
    return updates


def main() -> None:
    p=argparse.ArgumentParser(); p.add_argument("--version", required=True); p.add_argument("--check", action="store_true"); a=p.parse_args(); version=clean(a.version); tag="v"+version
    if dirty(): raise SystemExit("release requires a clean git worktree")
    if subprocess.run(["git","rev-parse","--verify","--quiet",f"refs/tags/{tag}"],cwd=ROOT).returncode == 0: raise SystemExit(f"tag already exists: {tag}")
    updates=replacements(version)
    changed=[path for path,text in updates.items() if (ROOT/path).read_text()!=text]
    print(f"version={version} tag={tag}"); print("would update: "+", ".join(changed) if changed else "no files")
    if not a.check:
        for path,text in updates.items(): (ROOT/path).write_text(text)
if __name__ == "__main__": main()
