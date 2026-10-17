# Independent walkthrough record

Tester: __________  Date: __________  Git commit: __________

Use a fresh Ubuntu server with suitable hardware and a separate browser profile. Do not share seed phrases or private keys with the project author. Record errors and confusing instructions in your own words.

| Step | Evidence to capture | Result / notes |
| --- | --- | --- |
| Check prerequisites | OS, CPU, RAM, free disk, public-IP setup | |
| Provision host | Exact command, completion message, reconnect if needed | |
| Start node | Pinned release, Compose status, snapshot progress | |
| Verify sync | Two `/v1/info` samples: advancing heights, low delays | |
| Connect local client | Read URL, optional tunnel, loaded profile feed | |
| Import custody account | Correct FID and public address; no secret screenshots | |
| Register app key | Public key and Optimism transaction hash | |
| Publish cast | Full cast hash and read-node inclusion response | |
| Reply | Parent cast and reply hash | |
| Follow/unfollow | Target FID and resulting protocol state | |
| Like/recast | Target cast and resulting reaction state | |
| Filter by client | Include/exclude requester FID and exact-key examples | |
| Lock/unlock | Passphrase unlock, wrong-password failure | |
| Restart client/node | Data and encrypted signer preserved | |
| Public endorsement | Tester-authored Farcaster cast URL | |

Do not publish custody phrases, app private keys, encryption passphrases, cloud credentials, SSH private keys, or sensitive logs. A truthful endorsement may include limitations and remaining issues. The tester must write and post it themselves.
