import { readFileSync } from 'node:fs';

let cities;
const regions=new Intl.DisplayNames(['en'],{type:'region'}),radians=Math.PI/180;
function cityData(){return cities??=JSON.parse(readFileSync(new URL('./data/cities.json',import.meta.url),'utf8'));}

export function resolveLocation(lat,lon,places=cityData()) {
  let nearest,distance=Infinity;
  for(const city of places){
    const [latitude,longitude]=city;
    const a=Math.sin((latitude-lat)*radians/2)**2+Math.cos(lat*radians)*Math.cos(latitude*radians)*Math.sin((longitude-lon)*radians/2)**2;
    if(a<distance){distance=a;nearest=city;}
  }
  const km=6371*2*Math.asin(Math.sqrt(Math.min(1,distance)));
  // This is an approximate nearby-city lookup, not a postal-address geocoder.
  if(!nearest||km>25)return {label:null};
  const country=regions.of(nearest[3])||nearest[3];
  return {label:`${km>10?'Near ':''}${nearest[2]}, ${country}`};
}

export function profileLocations() {
  const cache=new Map();
  return (req,res,next)=>{
    const url=new URL(req.url||'/','http://localhost');
    if(url.pathname!=='/api/profile/location')return next();
    const reply=(status,body)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(body));};
    if(req.method!=='GET')return reply(405,{error:'Use GET to resolve a profile location.'});
    const latitude=url.searchParams.get('lat')||'',longitude=url.searchParams.get('lon')||'';
    const decimal=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
    const lat=Number(latitude),lon=Number(longitude);
    if(!decimal.test(latitude)||!decimal.test(longitude)||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)return reply(400,{error:'Use valid latitude and longitude.'});
    const key=`${lat.toFixed(2)},${lon.toFixed(2)}`;
    try{
      if(!cache.has(key)){
        const [latitude,longitude]=key.split(',').map(Number);
        cache.set(key,resolveLocation(latitude,longitude));
        if(cache.size>1000)cache.delete(cache.keys().next().value);
      }
      return reply(200,cache.get(key));
    }catch{return reply(503,{error:'Profile location unavailable.'});}
  };
}
