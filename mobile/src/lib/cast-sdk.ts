let loaded:Promise<typeof import('@farcaster/core-gasless')>|undefined;
export function castSdk(){
  return loaded||=(async()=>{
    // Same Faker 7 compatibility bridge as the web's modern-sdk.mjs, while using
    // patched Faker 10. The SDK still calls the removed APIs during import.
    const {faker}=await import('@faker-js/faker');
    const bridge=faker as unknown as {datatype:{number?:(options?:unknown)=>number;datetime?:(options?:{min?:number;max?:number})=>Date};random?:{alphaNumeric:(length:number)=>string}};
    bridge.datatype.number||=options=>faker.number.int(options as Parameters<typeof faker.number.int>[0]);
    bridge.datatype.datetime||=options=>faker.date.between({from:options?.min??0,to:options?.max??Date.now()});
    bridge.random||={alphaNumeric:length=>faker.string.alphanumeric(length)};
    return import('@farcaster/core-gasless');
  })();
}
