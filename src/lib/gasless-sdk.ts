// @ts-expect-error Shared modern SDK loader also runs in the Node signing server.
import { loadModernSdk } from '../../modern-sdk.mjs';
export function loadGaslessSdk():Promise<typeof import('@farcaster/core-gasless')> {
  return loadModernSdk();
}
