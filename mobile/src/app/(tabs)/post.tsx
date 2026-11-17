import {Redirect} from 'expo-router';
import {useApp} from '../../lib/state';

// Tab presses open the composer over the current screen; handle direct links too.
export default function Post(){
  const {account}=useApp();
  return <Redirect href={account.session?'/compose':'/sign-in'}/>;
}
