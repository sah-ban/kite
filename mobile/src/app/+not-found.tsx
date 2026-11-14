import {router} from 'expo-router';
import {View} from 'react-native';
import {Button,Notice} from '../components/ui';
export default function NotFound(){return <View><Notice title="This page flew away">The link may be incomplete or no longer available.</Notice><View style={{padding:20}}><Button label="Back to Home" onPress={()=>router.replace('/')}/></View></View>;}
