# Prints this Mac's load as JSON: {"cpu", "mem", "battery", "charging", "load"} (percentages).
import json, os, re, subprocess

def run(*cmd):
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=5).stdout
    except Exception:
        return ""

ncpu = os.cpu_count() or 1
cpu = sum(float(x) for x in run("ps", "-A", "-o", "%cpu=").split() if x.replace(".", "", 1).isdigit()) / ncpu
vm = run("vm_stat")
page = int(re.search(r"page size of (\d+)", vm).group(1)) if "page size" in vm else 16384
def pages(label):
    m = re.search(label + r":\s+(\d+)", vm)
    return int(m.group(1)) if m else 0
used = (pages("Pages active") + pages("Pages wired down") + pages("Pages occupied by compressor")) * page
total = int(run("sysctl", "-n", "hw.memsize").strip() or 1)
batt = run("pmset", "-g", "batt")
m = re.search(r"(\d+)%;\s*([a-z ]+);", batt)
print(json.dumps({
    "cpu": round(min(100, cpu), 1),
    "mem": round(100 * used / total, 1),
    "battery": int(m.group(1)) if m else None,
    "charging": bool(m and ("charging" in m.group(2) and "discharging" not in m.group(2)) or "AC Power" in batt),
    "load": round(os.getloadavg()[0], 2),
}))
