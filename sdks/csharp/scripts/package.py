#!/usr/bin/env python3
"""Build both NuGet packages and a deterministic, installable UPM tarball."""
import gzip
import io
import pathlib
import subprocess
import tarfile
sdk = pathlib.Path(__file__).resolve().parents[1]
out = sdk / 'artifacts/packages'
out.mkdir(parents=True, exist_ok=True)
for name in ['Siming.Runtime', 'Siming.Serialization.Json']:
    subprocess.run(['dotnet','pack',str(sdk / 'src' / name / (name + '.csproj')),'-c','Release','-o',str(out),'-p:UseSharedCompilation=false','--disable-build-servers'],check=True)
package = sdk / 'Packages/dev.siming.sdk'
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
with (out / 'dev.siming.sdk-0.1.0.tgz').open('wb') as target:
    with gzip.GzipFile(fileobj=target, mode='wb', filename='', mtime=0) as compressed: compressed.write(buffer.getvalue())
print(out)
