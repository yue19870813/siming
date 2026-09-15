#!/usr/bin/env python3
"""Build both NuGet packages and a deterministic, installable UPM tarball."""
import argparse, gzip, json
import io
import pathlib
import subprocess
import tarfile
sdk = pathlib.Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(); parser.add_argument('--version', default=None); args = parser.parse_args()
package = sdk / 'Packages/dev.siming.sdk'
version = args.version or json.loads((package / 'package.json').read_text())['version']
out = sdk / 'artifacts/release' / version / 'sdk'
out.mkdir(parents=True, exist_ok=True)
for name in ['Siming.Runtime', 'Siming.Serialization.Json']:
    subprocess.run(['dotnet','pack',str(sdk / 'src' / name / (name + '.csproj')),'-c','Release','-o',str(out),'-p:UseSharedCompilation=false','--disable-build-servers'],check=True)
buffer = io.BytesIO()
with tarfile.open(fileobj=buffer, mode='w') as archive:
    for path in sorted(package.rglob('*')):
        if not path.is_file(): continue
        entry = archive.gettarinfo(str(path), 'package/' + path.relative_to(package).as_posix())
        entry.uid = entry.gid = 0
        entry.uname = entry.gname = ''
        entry.mtime = 0
        entry.mode = 0o644
        with path.open('rb') as content: archive.addfile(entry, content)
with (out / f'dev.siming.sdk-{version}.tgz').open('wb') as target:
    with gzip.GzipFile(fileobj=target, mode='wb', filename='', mtime=0) as compressed: compressed.write(buffer.getvalue())
print(out)
