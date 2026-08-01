import subprocess, sys, os
SKILL = r"C:/Users/81471/AppData/Local/Programs/WorkBuddy/resources/app.asar.unpacked/resources/builtin-skills/buddy-multimodal-generation/scripts/buddy-cloud.py"
PY = r"C:/Users/81471/.workbuddy/binaries/python/envs/default/Scripts/python.exe"

b64_file = sys.argv[1]       # .b64 file path
token = sys.argv[2]           # tempToken or token
extra_args = sys.argv[3:]     # e.g. --enable-pbr --face-count 500000 --no-poll

b64 = open(b64_file).read().strip()
cmd = [PY, SKILL, '3d', '--image-base64', b64] + extra_args + ['--token-stdin']
print("CMD args count:", len(cmd), "b64 len:", len(b64))
proc = subprocess.run(cmd, input=token.encode(), capture_output=True, text=True, timeout=30)
out = proc.stdout.strip()
err = proc.stderr.strip()
if out:
    print(out)
if err:
    print("STDERR:", err[:500])
sys.exit(proc.returncode)
