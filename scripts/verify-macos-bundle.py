#!/usr/bin/env python3
"""Verify macOS app signatures, including the actual apps shipped inside DMGs."""
import argparse
import subprocess
import sys
import tempfile
from pathlib import Path


def verify_apps(directory: Path) -> None:
    apps = sorted(directory.glob("*.app"))
    if not apps:
        raise ValueError(f"No app bundle found in {directory}")
    for app in apps:
        print(f"Verifying {app}", flush=True)
        subprocess.run(
            ["codesign", "--verify", "--deep", "--strict", "--verbose=2", str(app)],
            check=True,
        )


def verify_bundle(directory: Path) -> None:
    verify_apps(directory / "macos")
    images = sorted((directory / "dmg").glob("*.dmg"))
    if not images:
        raise ValueError(f"No DMG found in {directory / 'dmg'}")
    for image in images:
        # -readonly checks the shipped files without repairing or modifying them.
        with tempfile.TemporaryDirectory(prefix="siming-dmg-") as temporary:
            mountpoint = Path(temporary) / "volume"
            mountpoint.mkdir()
            subprocess.run(
                ["hdiutil", "attach", "-readonly", "-nobrowse", "-mountpoint",
                 str(mountpoint), str(image.resolve())],
                check=True,
            )
            try:
                verify_apps(mountpoint)
            finally:
                subprocess.run(["hdiutil", "detach", str(mountpoint)], check=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("bundle", type=Path, help="Tauri bundle output directory")
    args = parser.parse_args()
    if sys.platform != "darwin":
        parser.error("Signature verification requires macOS")
    verify_bundle(args.bundle)
