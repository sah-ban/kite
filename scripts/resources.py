#!/usr/bin/env python3
"""Read-only preflight: fail before downloading a network-sized database."""
import os
import shutil
import sys
from pathlib import Path

def inspect(root=None):
    root = root or Path(__file__).resolve().parents[1]
    memory = int(Path('/proc/meminfo').read_text().split('MemTotal:')[1].split()[0]) * 1024
    cpu = os.cpu_count() or 0
    free = shutil.disk_usage(root).free
    checks = [('CPU cores', cpu, 4, str), ('RAM', memory, 15 * 1024**3, lambda n: f'{n / 1024**3:.1f} GiB'), ('Free disk', free, 1_500_000_000_000, lambda n: f'{n / 10**12:.2f} TB')]
    for name, value, minimum, fmt in checks:
        print(f'{"PASS" if value >= minimum else "FAIL"}  {name}: {fmt(value)} (minimum {fmt(minimum)})')
    print('Also required: public IP, inbound UDP 3382, outbound peer/snapshot access.')
    if not all(value >= minimum for _, value, minimum, _ in checks):
        print('This host is too small for a full read node. The local client can still use an existing hub.')
        return False
    return True

if __name__ == '__main__':
    sys.exit(0 if inspect() else 1)
