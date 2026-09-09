#!/usr/bin/env python3
"""Stable GUIDs for package assets, including importable sample files."""
import pathlib
import uuid
root = pathlib.Path(__file__).resolve().parents[1] / 'Packages/dev.siming.sdk'
for path in sorted(root.rglob('*')):
    if path.name.endswith('.meta'): continue
    guid = uuid.uuid5(uuid.NAMESPACE_URL, 'https://siming.dev/upm/' + path.relative_to(root).as_posix()).hex
    meta = pathlib.Path(str(path) + '.meta')
    kind = 'folderAsset: yes\n' if path.is_dir() else ''
    meta.write_text('fileFormatVersion: 2\nguid: ' + guid + '\n' + kind)
