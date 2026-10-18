let loaded:Promise<typeof import('@farcaster/core-gasless')>|undefined;

export function loadGaslessSdk() {
  return loaded ||= (async()=>{
    // The SDK initializes bundled test factories using Faker 7 APIs. Keep
    // patched Faker 10 and bridge only the removed APIs used during import.
    // Registration/signing uses the SDK's protocol builders, never factories.
    const {faker}=await import('@faker-js/faker');
    const legacy=faker as unknown as {
      datatype:{number?:(options?:{min?:number;max?:number})=>number;datetime?:(options?:{min?:number;max?:number})=>Date};
      random?:{alphaNumeric:(length:number)=>string};
    };
    legacy.datatype.number ||= options=>faker.number.int(options);
    legacy.datatype.datetime ||= options=>faker.date.between({from:options?.min??0,to:options?.max??Date.now()});
    legacy.random ||= {alphaNumeric:length=>faker.string.alphanumeric(length)};
    return import('@farcaster/core-gasless');
  })();
}
