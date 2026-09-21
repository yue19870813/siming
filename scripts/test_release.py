"""Release regression tests using isolated repositories, never the real index."""
import importlib.util
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("release", ROOT / "scripts/release.py")
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.old_root = release.ROOT
        for path in release.FILES + ["Cargo.lock", "sdks/csharp/tests/RustReference/Cargo.lock", "scripts/release.py", ".gitattributes"]:
            target = self.root / path
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / path, target)
        release.ROOT = self.root
        self.git("init", "-q")
        self.git("config", "user.name", "Release Test")
        self.git("config", "user.email", "test@example.invalid")
        self.git("add", "--", *release.FILES, "Cargo.lock", "sdks/csharp/tests/RustReference/Cargo.lock", "scripts/release.py", ".gitattributes")
        self.git("commit", "-qm", "fixture")

    def tearDown(self):
        release.ROOT = self.old_root
        self.temp.cleanup()

    def git(self, *args):
        return subprocess.check_output(["git", *args], cwd=self.root, text=True)

    def run_release(self, *args):
        return subprocess.run(["python3", "scripts/release.py", *args], cwd=self.root, capture_output=True, text=True)

    def test_upgrade_lockfiles_and_idempotence(self):
        original = (self.root / "Cargo.lock").read_text()
        old_version = re.search(r'name = "siming-core"\nversion = "([^"]+)"', original)[1]
        target_version = "99.0.1" if old_version != "99.0.1" else "99.0.2"
        updates = release.replacements(target_version)
        for path, text in updates.items():
            (self.root / path).write_text(text)
        self.assertEqual(updates, release.replacements(target_version))
        self.assertEqual(original.count(f'version = "{old_version}"') - 4, updates['Cargo.lock'].count(f'version = "{old_version}"'))
        reference = updates['sdks/csharp/tests/RustReference/Cargo.lock']
        self.assertIn(f'name = "siming-core"\nversion = "{target_version}"', reference)
        self.assertIn('name = "siming-sdk-reference"\nversion = "0.1.0"', reference)
        self.assertIn('version = "0.2.0-beta.1"', release.replacements("0.2.0-beta.1")['Cargo.lock'])

    def test_dry_run_and_guards(self):
        self.assertEqual(self.run_release("--version", "0.1.1", "--check").returncode, 0)
        self.assertEqual(self.git("status", "--porcelain"), "")
        self.assertNotEqual(self.run_release("--version", "invalid", "--check").returncode, 0)
        self.git("tag", "v0.1.1")
        self.assertIn("tag already exists", self.run_release("--version", "0.1.1", "--check").stderr)
        (self.root / "untracked.txt").write_text("dirty")
        self.assertIn("clean git worktree", self.run_release("--version", "0.1.2", "--check").stderr)

    def test_windows_checkout_uses_lf(self):
        path = self.root / "apps/desktop/src-tauri/tauri.conf.json"
        expected = path.read_bytes()
        self.git("config", "core.autocrlf", "true")
        path.unlink()
        self.git("checkout", "--", "apps/desktop/src-tauri/tauri.conf.json")
        self.assertEqual(path.read_bytes(), expected)
        self.assertNotIn(b"\r\n", path.read_bytes())


if __name__ == "__main__":
    unittest.main()
