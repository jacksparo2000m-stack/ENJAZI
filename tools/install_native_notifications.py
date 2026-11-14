#!/usr/bin/env python3
"""Install ENJAZI's app-owned persistent notification bridge after `cap add android`."""
from pathlib import Path
import re
import shutil

ROOT = Path(__file__).resolve().parents[1]
PACKAGE_DIR = Path("android/app/src/main/java/com/jacksparo/enjazi")
SOURCE_DIR = ROOT / "native/android"
TARGET_DIR = ROOT / PACKAGE_DIR
TARGET_DIR.mkdir(parents=True, exist_ok=True)

for filename in (
    "PersistentTaskNotifications.java",
    "PersistentTasksPlugin.java",
    "PersistentTaskRestoreReceiver.java",
):
    source = SOURCE_DIR / filename
    if not source.is_file():
        raise SystemExit(f"Missing native source: {source}")
    shutil.copy2(source, TARGET_DIR / filename)

main = ROOT / "android/app/src/main/java/com/jacksparo/enjazi/MainActivity.java"
if not main.is_file():
    raise SystemExit("Generated Capacitor MainActivity.java was not found")
source = main.read_text(encoding="utf-8")
if "com.jacksparo.enjazi.PersistentTasksPlugin" not in source:
    source = source.replace(
        "import com.getcapacitor.BridgeActivity;",
        "import com.getcapacitor.BridgeActivity;\nimport com.jacksparo.enjazi.PersistentTasksPlugin;",
        1,
    )
if "PersistentTasksPlugin.class" not in source:
    if "import android.os.Bundle;" not in source:
        source = source.replace(
            "package com.jacksparo.enjazi;",
            "package com.jacksparo.enjazi;\n\nimport android.os.Bundle;",
            1,
        )
    if "super.onCreate(savedInstanceState);" in source:
        source = source.replace(
            "super.onCreate(savedInstanceState);",
            "registerPlugin(PersistentTasksPlugin.class);\n        super.onCreate(savedInstanceState);",
            1,
        )
    else:
        pattern = r"(public class MainActivity extends BridgeActivity\s*\{)"
        replacement = (
            r"\1\n    @Override\n"
            r"    public void onCreate(Bundle savedInstanceState) {\n"
            r"        registerPlugin(PersistentTasksPlugin.class);\n"
            r"        super.onCreate(savedInstanceState);\n"
            r"    }"
        )
        source, count = re.subn(pattern, replacement, source, count=1)
        if count != 1:
            raise SystemExit("Could not register PersistentTasksPlugin in MainActivity")
main.write_text(source, encoding="utf-8")

manifest = ROOT / "android/app/src/main/AndroidManifest.xml"
if not manifest.is_file():
    raise SystemExit("Generated AndroidManifest.xml was not found")
xml = manifest.read_text(encoding="utf-8")
for permission in (
    "android.permission.POST_NOTIFICATIONS",
    "android.permission.RECEIVE_BOOT_COMPLETED",
):
    if permission not in xml:
        xml = xml.replace(
            "<application",
            f'<uses-permission android:name="{permission}"/>\n    <application',
            1,
        )
if "PersistentTaskRestoreReceiver" not in xml:
    receiver = '''    <receiver
        android:name=".PersistentTaskRestoreReceiver"
        android:enabled="true"
        android:exported="false">
        <intent-filter>
            <action android:name="android.intent.action.BOOT_COMPLETED"/>
            <action android:name="android.intent.action.MY_PACKAGE_REPLACED"/>
            <action android:name="android.intent.action.QUICKBOOT_POWERON"/>
        </intent-filter>
    </receiver>
'''
    if "</application>" not in xml:
        raise SystemExit("Could not locate application closing tag in AndroidManifest.xml")
    xml = xml.replace("</application>", receiver + "</application>", 1)
manifest.write_text(xml, encoding="utf-8")

if "PersistentTasksPlugin.class" not in main.read_text(encoding="utf-8"):
    raise SystemExit("PersistentTasksPlugin registration verification failed")
if "PersistentTaskRestoreReceiver" not in manifest.read_text(encoding="utf-8"):
    raise SystemExit("PersistentTaskRestoreReceiver manifest verification failed")
print("ENJAZI persistent task notification bridge installed.")
