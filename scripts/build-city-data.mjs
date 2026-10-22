import { readFile, mkdir, writeFile } from 'node:fs/promises';

// Input: the cities15000.txt file from https://download.geonames.org/export/dump/.
if(!process.argv[2])throw new Error('Usage: node scripts/build-city-data.mjs /path/to/cities15000.txt');
const rows=(await readFile(process.argv[2],'utf8')).trim().split('\n').map(line=>{
  const fields=line.split('\t');
  return [Number(fields[4]),Number(fields[5]),fields[1],fields[8]];
});
if(rows.length<20_000||rows.some(([lat,lon,name,country])=>!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180||!name||!/^[A-Z]{2}$/.test(country)))throw new Error('Invalid GeoNames city data');
await mkdir(new URL('../data/',import.meta.url),{recursive:true});
await writeFile(new URL('../data/cities.json',import.meta.url),JSON.stringify(rows)+'\n');
console.log(`Prepared ${rows.length} cities for offline profile locations.`);
