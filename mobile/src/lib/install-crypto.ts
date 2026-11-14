type CryptoScope={crypto?:{getRandomValues?:unknown}};

export function installRandomValues(scope:CryptoScope,fill:unknown){
  if(typeof scope.crypto?.getRandomValues==='function')return;
  if(typeof fill!=='function')throw new Error('A secure random provider is required.');
  const provider=scope.crypto||{};
  Object.defineProperty(provider,'getRandomValues',{value:fill,configurable:true});
  if(!scope.crypto)Object.defineProperty(scope,'crypto',{value:provider,configurable:true});
}
