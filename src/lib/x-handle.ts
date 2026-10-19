export function xHandle(value:unknown):string|undefined {
  if(typeof value!=='string')return;
  const handle=value.trim().replace(/^@/,'');
  return /^[a-zA-Z0-9_]{1,15}$/.test(handle)?handle:undefined;
}
