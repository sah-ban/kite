import {safeLink,type Profile} from './model';

export const profileFields={name:{type:2,label:'Display name',max:32},bio:{type:3,label:'Bio',max:256},website:{type:5,label:'Website',max:256},avatar:{type:1,label:'Profile image',max:256},banner:{type:10,label:'Banner',max:256}} as const;
export type ProfileField=keyof typeof profileFields;
export type ProfileChanges=Partial<Pick<Profile,ProfileField>>;
export function profileChanges(value:ProfileChanges):[ProfileField,string][]{
  if(!value||typeof value!=='object'||Object.keys(value).some(key=>!Object.hasOwn(profileFields,key)))throw new Error('Invalid profile changes.');
  return Object.entries(value).map(([key,value])=>{
    const field=key as ProfileField,rule=profileFields[field];
    if(typeof value!=='string'||new TextEncoder().encode(value).length>rule.max)throw new Error(`${rule.label} must be ${rule.max} UTF-8 bytes or fewer.`);
    if(['website','avatar','banner'].includes(field)&&value&&!safeLink(value))throw new Error(`${rule.label} must be a valid HTTP or HTTPS URL.`);
    return [field,value];
  });
}
