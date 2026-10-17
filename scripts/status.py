#!/usr/bin/env python3
import json
import os
import sys
import urllib.request
base = os.environ.get('NODE_STATUS_URL', 'http://127.0.0.1:3381').rstrip('/')
try:
    with urllib.request.urlopen(base + '/v1/info', timeout=15) as response:
        info = json.load(response)
    print('Node:', base, 'version:', info.get('version', 'unknown'))
    shards = info.get('shardInfos', [])
    for shard in shards:
        print(f'Shard {shard["shardId"]}: height {shard["maxHeight"]:,}, delay {shard["blockDelay"]} seconds')
    if not shards or any(s['blockDelay'] > 10 for s in shards):
        print('Still catching up. Watch heights advance and delays decrease.'); sys.exit(2)
    print('Low shard delay. Repeat later to confirm heights continue advancing.')
except Exception as error:
    print('Node unavailable:', error, file=sys.stderr); sys.exit(1)
