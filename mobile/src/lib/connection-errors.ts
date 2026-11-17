export const CONNECTION_UNAVAILABLE='Check your Wi-Fi or mobile data, then try again.';
export const CONNECTION_TIMEOUT='The connection is taking too long. Please try again.';

export function connectionNotice(message:unknown){
  if(typeof message!=='string')return;
  if(message===CONNECTION_UNAVAILABLE||/UnknownHostException|Unable to resolve host|Network request failed|Failed to fetch|fetch failed|Could not connect to Kite\. Check your internet connection\./i.test(message))return {title:'Can’t connect right now',message:CONNECTION_UNAVAILABLE,icon:'wifi-off' as const};
  if(message===CONNECTION_TIMEOUT||message==='The request timed out. Check your connection and try again.')return {title:'Taking longer than expected',message:CONNECTION_TIMEOUT,icon:'clock' as const};
}
