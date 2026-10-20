export function writeOrigin(req, config) {
  const direct = new URL(`${req.socket?.encrypted?'https':'http'}://${req.headers.host}`);
  const localHost = ['localhost','127.0.0.1','[::1]'].includes(direct.hostname);
  const localPeer = ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket?.remoteAddress);
  const configured = config.FREECAST_PUBLIC_URL ? new URL(config.FREECAST_PUBLIC_URL) : direct;
  // A hosted origin may remain in .env when the app is also opened locally.
  // Trust loopback only when both the request host and TCP peer are loopback.
  return localHost && localPeer && configured.host!==direct.host ? direct : configured;
}
