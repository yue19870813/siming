"""Validate update URLs against collected GitHub release asset names."""
import contextlib
import io
import importlib.util
import tempfile
import unittest
from pathlib import Path


def load(name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


updater = load("create-update-manifest")
collector = load("collect-release-assets")


class ManifestTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.source = Path(self.temp.name) / "source"
        self.assets = Path(self.temp.name) / "assets"
        for group, names in {
            "desktop-windows-x64": ["Siming_0.2.0_x64-setup.exe", "Siming_0.2.0_x64-setup.exe.sig", "Siming.msi", "Siming.msi.sig"],
            "desktop-macos-arm64": ["司命.app.tar.gz", "司命.app.tar.gz.sig", "Siming.dmg"],
            "desktop-macos-x64": ["司命.app.tar.gz", "司命.app.tar.gz.sig", "Siming.dmg"],
            "sdk": ["unity.tgz", "core.nupkg", "sdk.nupkg"],
        }.items():
            directory = self.source / group
            directory.mkdir(parents=True)
            for name in names:
                (directory / name).write_text("signed-by-test" if name.endswith(".sig") else "test")
        with contextlib.redirect_stdout(io.StringIO()):
            collector.collect(self.source, self.assets)

    def test_platforms_urls_signatures_and_notes(self):
        result = updater.manifest(self.assets, "0.2.0", "Release notes")
        self.assertEqual(set(result["platforms"]), {"darwin-aarch64", "darwin-x86_64", "windows-x86_64"})
        self.assertEqual(result["notes"], "Release notes")
        self.assertEqual(result["version"], "0.2.0")
        for platform in result["platforms"].values():
            self.assertEqual(platform["signature"], "signed-by-test")
            self.assertIn("/releases/download/v0.2.0/", platform["url"])
            self.assertTrue(platform["url"].isascii())
        self.assertTrue(result["platforms"]["windows-x86_64"]["url"].endswith(".exe"))

    def test_macos_generated_names_are_stable_ascii_names(self):
        self.assertTrue((self.assets / "macos-arm64-Siming.app.tar.gz").exists())
        self.assertTrue((self.assets / "macos-arm64-Siming.app.tar.gz.sig").exists())
        result = updater.manifest(self.assets, "0.2.2")
        self.assertTrue(result["platforms"]["darwin-aarch64"]["url"].endswith("macos-arm64-Siming.app.tar.gz"))

    def test_missing_signature_rejected(self):
        next(self.assets.glob("macos-arm64-*.sig")).unlink()
        with self.assertRaises(FileNotFoundError):
            updater.manifest(self.assets, "0.2.0")

    def test_missing_installer_rejected_even_with_update_archive(self):
        (self.source / "desktop-macos-arm64" / "Siming.dmg").unlink()
        with contextlib.redirect_stdout(io.StringIO()), self.assertRaises(ValueError):
            collector.collect(self.source, self.assets.with_name("incomplete"))

    def test_missing_platform_rejected(self):
        next(self.assets.glob("macos-x64-*.app.tar.gz")).unlink()
        with self.assertRaises(ValueError):
            updater.manifest(self.assets, "0.2.0")

    def test_ambiguous_package_rejected(self):
        (self.assets / "macos-x64-extra.app.tar.gz").write_text("extra")
        with self.assertRaises(ValueError):
            updater.manifest(self.assets, "0.2.0")

    def test_empty_signature_rejected(self):
        next(self.assets.glob("macos-arm64-*.sig")).write_text("\n")
        with self.assertRaises(ValueError):
            updater.manifest(self.assets, "0.2.0")

    def test_invalid_version_rejected(self):
        with self.assertRaises(ValueError):
            updater.manifest(self.assets, "../../bad")


if __name__ == "__main__":
    unittest.main()
