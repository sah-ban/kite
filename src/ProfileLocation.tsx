import { useEffect, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { coordinateLabel, geoCoordinates } from './lib/location';

export function ProfileLocation({value}:{value:string}) {
  const coordinates=geoCoordinates(value),lat=coordinates?.lat,lon=coordinates?.lon;
  const [resolved,setResolved]=useState<{lat:number;lon:number;label:string}>();
  useEffect(()=>{
    if(lat===undefined||lon===undefined)return;
    const abort=new AbortController();
    fetch(`/api/profile/location?${new URLSearchParams({lat:String(lat),lon:String(lon)})}`,{signal:AbortSignal.any([abort.signal,AbortSignal.timeout(7000)])}).then(async response=>{
      if(!response.ok)return;
      const result=await response.json();
      if(!abort.signal.aborted&&typeof result.label==='string'&&result.label.trim()&&result.label.length<=302)setResolved({lat,lon,label:result.label});
    }).catch(()=>{/* Keep the map link and coordinates when the lookup is unavailable. */});
    return()=>abort.abort();
  },[lat,lon]);
  if(!coordinates)return <>{value}</>;
  const label=resolved&&resolved.lat===lat&&resolved.lon===lon?resolved.label:undefined;
  const href=`https://www.openstreetmap.org/?${new URLSearchParams({mlat:String(lat),mlon:String(lon)})}#map=11/${lat}/${lon}`;
  return <span className="profile-location"><a href={href} target="_blank" rel="noopener noreferrer">{label||coordinateLabel(coordinates)}<ArrowUpRight size={14}/></a>{label&&<small><a href="https://www.geonames.org/" target="_blank" rel="noopener noreferrer">GeoNames</a></small>}</span>;
}
