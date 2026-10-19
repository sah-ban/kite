import type { CastLimits } from './lib/cast-limits';
export function ComposerUsage({usage,limits}:{usage:{bytes:number;error:string};limits:CastLimits}) {
  return <div className="composer-usage"><p className="small muted">{usage.bytes.toLocaleString()} / {limits.maxBytes.toLocaleString()} bytes{limits.checking?' · Checking Pro limits…':limits.pro?' · Pro':''}</p>{usage.error&&<p className="small danger" role="alert">{usage.error}</p>}</div>;
}
