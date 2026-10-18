export const PROFILE_FIELDS=[
  {key:'name',type:2,label:'Display name',limit:32},
  {key:'bio',type:3,label:'Bio',limit:256},
  {key:'avatar',type:1,label:'Profile picture',limit:256,url:true},
  {key:'banner',type:10,label:'Banner',limit:256,url:true},
  {key:'website',type:5,label:'Website',limit:256,url:true},
];
export function validateProfileField(type,value) {
  const field=PROFILE_FIELDS.find(field=>field.type===type);
  if(!field||typeof value!=='string')throw new Error('Invalid profile field.');
  if(new TextEncoder().encode(value).length>field.limit)throw new Error(`${field.label} must be ${field.limit} UTF-8 bytes or fewer.`);
  if(field.url&&value){
    let url;try{url=new URL(value);}catch{throw new Error(`${field.label} must be an HTTP or HTTPS URL.`);}
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error(`${field.label} must be an HTTP or HTTPS URL without credentials.`);
  }
  return {type,value};
}
