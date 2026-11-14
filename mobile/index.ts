// Native crypto must exist before Router evaluates routes that import Farcaster.
import './src/lib/crypto-bootstrap';
import 'expo-router/entry';
