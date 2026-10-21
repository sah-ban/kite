import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

test('node preflight requires 2 TB free before allowing snapshot setup',()=>{
  const result=execFileSync('python3',['-c',`
import contextlib, importlib.util, io, json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
spec = importlib.util.spec_from_file_location('resources', 'scripts/resources.py')
resources = importlib.util.module_from_spec(spec)
spec.loader.exec_module(resources)
results = []
for free in [1_500_000_000_000, 1_999_999_999_999, 2_000_000_000_000]:
    with patch.object(resources.os, 'cpu_count', return_value=4), patch.object(resources.Path, 'read_text', return_value='MemTotal: 16777216 kB'), patch.object(resources.shutil, 'disk_usage', return_value=SimpleNamespace(free=free)), contextlib.redirect_stdout(io.StringIO()):
        results.append(resources.inspect(Path('.')))
print(json.dumps(results))
`],{cwd:process.cwd(),encoding:'utf8'});
  assert.deepEqual(JSON.parse(result),[false,false,true]);
});
