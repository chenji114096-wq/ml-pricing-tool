#!/usr/bin/env python3
"""同步 git 仓库代码到 /root 运行版并重启服务"""
import shutil, os, subprocess, signal, time

SRC = "/home/ubuntu/ml-pricing-tool"
DST = "/root/ml-pricing-tool"

FILES = [
    ("backend/main.py", "backend/main.py"),
    ("backend/tax_calc.py", "backend/tax_calc.py"),
    ("frontend/index.html", "frontend/index.html"),
    ("frontend/app.js", "frontend/app.js"),
    ("frontend/style.css", "frontend/style.css"),
]

print("=== 1. 同步文件 ===")
for s, d in FILES:
    sp, dp = os.path.join(SRC, s), os.path.join(DST, d)
    os.makedirs(os.path.dirname(dp), exist_ok=True)
    shutil.copy2(sp, dp)
    print(f"  {s} -> {dp} ({os.path.getsize(dp)} bytes)")

# 前端实际由 nginx 从 /var/www/mlprecios/ 服务
WWW = "/var/www/mlprecios"
print("=== 1b. 同步前端到 /var/www/mlprecios (nginx) ===")
for s in ["frontend/index.html", "frontend/app.js", "frontend/style.css"]:
    sp, dp = os.path.join(SRC, s), os.path.join(WWW, os.path.basename(s))
    shutil.copy2(sp, dp)
    print(f"  {s} -> {dp} ({os.path.getsize(dp)} bytes)")

print("=== 2. 语法检查 ===")
import py_compile
for s, d in FILES:
    if d.endswith(".py"):
        py_compile.compile(os.path.join(DST, d), doraise=True)
        print(f"  {d} compile OK")

print("=== 3. 杀掉 uvicorn（Restart=always 自动拉起）===")
r = subprocess.run(["pgrep", "-f", "uvicorn main:app"], capture_output=True, text=True)
pids = [p for p in r.stdout.split() if p]
print(f"  找到 uvicorn PIDs: {pids}")
for pid in pids:
    try:
        os.kill(int(pid), signal.SIGTERM)
        print(f"  killed {pid}")
    except ProcessLookupError:
        pass
    except Exception as e:
        print(f"  kill {pid} failed: {e}")

print("=== 4. 等待服务重启 ===")
for i in range(15):
    time.sleep(2)
    try:
        import urllib.request
        with urllib.request.urlopen("http://127.0.0.1:8899/api/health", timeout=3) as resp:
            body = resp.read().decode()
            if '"ok"' in body:
                print(f"  health OK: {body}")
                break
    except Exception as e:
        print(f"  attempt {i+1}: {e}")
else:
    print("  WARNING: 服务未在 30s 内恢复")
    raise SystemExit(1)

print("=== DONE ===")
