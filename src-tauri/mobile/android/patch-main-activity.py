#!/usr/bin/env python3
"""给 `tauri android init` 生成的 MainActivity 补 WindowInsets padding。

Tauri 的 Android 模板在 onCreate 里无条件调用 enableEdgeToEdge()，页面会从屏幕
最顶端开始画，状态栏的时间/电量图标直接压在应用自己的标题栏上（Android 13 等旧
系统同样复现）。这里保留 edge-to-edge，但给根 content view 挂 insets 监听，按
systemBars + displayCutout + ime 设置 padding，让内容让出状态栏、刘海和输入法。

必须在 `tauri android init` 之后、Gradle 构建之前执行；包目录由
tauri.conf.json 的 identifier 决定（点换成斜杠）。重复执行是安全的（幂等）。
"""
import json
import pathlib
import re
import sys

CONF = pathlib.Path("src-tauri/tauri.conf.json")
if not CONF.exists():
    sys.exit("ERROR: src-tauri/tauri.conf.json not found")

ident = json.loads(CONF.read_text())["identifier"]
target = (
    pathlib.Path("src-tauri/gen/android/app/src/main/java")
    / pathlib.Path(*ident.split("."))
    / "MainActivity.kt"
)
if not target.exists():
    sys.exit(f"ERROR: {target} not found (did `tauri android init` run?)")

src = target.read_text()
if "requestApplyInsets" in src:
    print(f"MainActivity already patched: {target}")
    sys.exit(0)

IMPORTS = [
    "import android.os.Bundle",
    "import android.view.View",
    "import androidx.core.view.ViewCompat",
    "import androidx.core.view.WindowInsetsCompat",
    "import androidx.core.view.updatePadding",
]

lines = src.splitlines()
existing = {line.strip() for line in lines if line.strip().startswith("import ")}
try:
    pkg_idx = next(i for i, line in enumerate(lines) if line.strip().startswith("package "))
except StopIteration:
    sys.exit("ERROR: `package ...` line not found in MainActivity.kt")

to_add = [imp for imp in IMPORTS if imp not in existing]
if to_add:
    last_import = max(
        (i for i, line in enumerate(lines) if line.strip().startswith("import ")),
        default=pkg_idx,
    )
    lines[last_import + 1:last_import + 1] = to_add
    src = "\n".join(lines) + "\n"

BLOCK = """
    // edge-to-edge 保留，但内容要让出状态栏、刘海和输入法
    val content = findViewById<View>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      val bars = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
      )
      val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
      view.updatePadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, ime.bottom))
      insets
    }
    ViewCompat.requestApplyInsets(content)"""

match = re.search(r"(\n[ \t]*super\.onCreate\([^)]*\))", src)
if not match:
    sys.exit("ERROR: `super.onCreate(...)` not found in MainActivity.kt")

src = src[: match.end()] + "\n" + BLOCK + src[match.end():]
target.write_text(src)
print(f"patched MainActivity: {target}")
