import {getRandomValues} from 'expo-crypto';
import {installRandomValues} from './install-crypto';

// Use the native CSPRNG directly; never use Expo's development getRandomBytes
// fallback or Math.random for cryptographic randomness.
installRandomValues(globalThis,getRandomValues);
