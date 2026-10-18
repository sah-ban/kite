let loaded;
export function loadModernSdk() {
  return loaded ||= (async()=>{
    // The SDK's bundled factories still call Faker 7 APIs during import.
    // Bridge those removed APIs while keeping patched Faker 10 installed.
    const {faker}=await import('@faker-js/faker');
    faker.datatype.number ||= options=>faker.number.int(options);
    faker.datatype.datetime ||= options=>faker.date.between({from:options?.min??0,to:options?.max??Date.now()});
    faker.random ||= {alphaNumeric:length=>faker.string.alphanumeric(length)};
    return import('@farcaster/core-gasless');
  })();
}
