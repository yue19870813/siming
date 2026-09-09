#!/usr/bin/env python3
"""Prepare an ignored Unity 6 validation project; no Unity installation is modified."""
import json
import pathlib
import shutil
sdk = pathlib.Path(__file__).resolve().parents[1]
project = sdk / 'artifacts/unity-validation'
(project / 'Packages').mkdir(parents=True, exist_ok=True)
(project / 'ProjectSettings').mkdir(exist_ok=True)
(project / 'Packages/manifest.json').write_text(json.dumps({'dependencies': {
    'dev.siming.sdk': 'file:' + str(sdk / 'Packages/dev.siming.sdk'),
    'com.unity.modules.imgui': '1.0.0', 'com.unity.modules.unitywebrequest': '1.0.0',
    'com.unity.modules.unitywebrequestwww': '1.0.0', 'com.unity.modules.jsonserialize': '1.0.0'
}}, indent=2) + '\n')
(project / 'ProjectSettings/ProjectVersion.txt').write_text('m_EditorVersion: 6000.3.13f1\n')
shutil.copytree(sdk / 'tests/Unity', project / 'Assets/Validation', dirs_exist_ok=True)
sample = sdk / 'Packages/dev.siming.sdk/Samples~/BasicDialogue'
shutil.copytree(sample, project / 'Assets/BasicDialogue', dirs_exist_ok=True, ignore=shutil.ignore_patterns('RuntimeData', 'README.md'))
shutil.copytree(sample / 'RuntimeData', project / 'Assets/StreamingAssets/Siming', dirs_exist_ok=True)
print(project)
