// Log diagnostic categories, never arbitrary upstream/database messages or URLs.
const endpoints=new Set(['info','events','linksByFid','castsByFid','onChainSignersByFid','signersByFid']);
const messages=new Set([
  'Configure DATABASE_URL and KITE_FEED_GRPC_URL','Invalid feed history days','Invalid feed gRPC URL',
  'A feed worker is already running','Invalid follow page','Follow list exceeds import capacity',
  'Repeated follow cursor','Invalid signer page','Repeated signer cursor','Signer sync unavailable',
  'No event checkpoint available','Invalid cast page','Repeated cast cursor','Invalid indexed cast',
  'No message shards available','Event stream ended','Stopping','Invalid enrollment FID',
  'Feed enrollment is currently at capacity. Please try again later.',
]);
const networkCodes=new Set(['ECONNREFUSED','ECONNRESET','ENOTFOUND','EAI_AGAIN','ETIMEDOUT','EHOSTUNREACH','ENETUNREACH','EPIPE','EPROTO','ERR_INVALID_URL','ERR_TLS_CERT_ALTNAME_INVALID','DEPTH_ZERO_SELF_SIGNED_CERT','CERT_HAS_EXPIRED','UNABLE_TO_VERIFY_LEAF_SIGNATURE','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT','UND_ERR_SOCKET']);
const databaseCodes=new Map([
  ['28P01','authentication failed'],['3D000','database missing'],['42P01','table missing'],['42703','column missing'],
  ['23505','duplicate key'],['23503','foreign key violation'],['23502','missing required value'],['22P02','invalid value'],
  ['22003','numeric value out of range'],['40001','transaction serialization failure'],['40P01','deadlock'],
  ['53300','too many connections'],['57014','query cancelled or timed out'],['57P01','database shutting down'],
  ['57P03','database unavailable'],['08001','connection failed'],['08006','connection lost'],
]);
const databaseMessages=new Map([
  ['timeout exceeded when trying to connect','database connection timed out'],
  ['Connection terminated due to connection timeout','database connection timed out'],
  ['Connection terminated unexpectedly','database connection terminated unexpectedly'],
  ['Connection terminated','database connection terminated'],
]);

export class NodeReadError extends Error {
  constructor(endpoint,{status,cause,invalidJson=false}={}){
    super('Feed node request failed',{cause});
    this.endpoint=endpoints.has(endpoint)?endpoint:'node request';
    this.status=status;this.invalidJson=invalidJson;
  }
}

export function workerError(error,depth=0){
  if(depth>4)return 'unexpected error';
  if(error instanceof NodeReadError){
    const reason=Number.isInteger(error.status)&&error.status>=100&&error.status<=599?`HTTP ${error.status}`:error.invalidJson?'invalid JSON response':workerError(error.cause,depth+1);
    return `${error.endpoint}: ${reason}`;
  }
  if(error instanceof AggregateError){
    return `${error.message==='Signer sync unavailable'?'signer sync unavailable':'multiple failures'} (${error.errors.slice(0,2).map(cause=>workerError(cause,depth+1)).join('; ')})`;
  }
  if(networkCodes.has(error?.code))return error.code;
  if(databaseCodes.has(error?.code))return `PostgreSQL ${error.code}: ${databaseCodes.get(error.code)}`;
  if(typeof error?.code==='string'&&/^[0-9A-Z]{5}$/.test(error.code))return `PostgreSQL ${error.code}`;
  if(Number.isInteger(error?.code)&&error.code>=0&&error.code<=16)return `gRPC status ${error.code}`;
  if(error?.name==='TimeoutError')return 'request timed out';
  if(error?.name==='AbortError')return 'request aborted';
  if(databaseMessages.has(error?.message))return databaseMessages.get(error.message);
  if(messages.has(error?.message))return error.message;
  if(error?.cause)return workerError(error.cause,depth+1);
  if(error instanceof SyntaxError)return 'invalid response data';
  if(error instanceof TypeError)return 'invalid data or failed network request';
  return 'unexpected error';
}

export function workerDiagnostics(log,{now=Date.now,interval=300000,maxEntries=10000}={}){
  const failures=new Map();
  return {
    failure(key,label,error){
      const reason=workerError(error),message=`${label}: ${reason}`,previous=failures.get(key),time=now();
      if(!previous||previous.message!==message||time-previous.time>=interval){
        failures.delete(key);failures.set(key,{message,time});
        if(failures.size>maxEntries)failures.delete(failures.keys().next().value);
        log(message);
      }
    },
    recovered(key,label,wasFailed=false){if(failures.delete(key)||wasFailed)log(label);},
  };
}
