export function geoCoordinates(value:string):{lat:number;lon:number}|undefined {
  const match=/^geo:([+-]?(?:\d+(?:\.\d*)?|\.\d+)),([+-]?(?:\d+(?:\.\d*)?|\.\d+))(?:,[+-]?(?:\d+(?:\.\d*)?|\.\d+))?(?:;u=\d+(?:\.\d+)?)?$/i.exec(value.trim());
  if(!match)return;
  const lat=Number(match[1]),lon=Number(match[2]);
  if(Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180)return {lat,lon};
}

export function coordinateLabel({lat,lon}:{lat:number;lon:number}):string {
  return `${Math.abs(lat)}° ${lat<0?'S':'N'}, ${Math.abs(lon)}° ${lon<0?'W':'E'}`;
}
