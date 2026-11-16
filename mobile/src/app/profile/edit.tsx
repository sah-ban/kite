import {useApp} from '../../lib/state';
import {useQuery} from '../../lib/hooks';
import {Loading,Notice} from '../../components/ui';
import {ProfileEditor} from '../../components/ProfileEditor';

export default function EditProfile(){
  const {api,account}=useApp(),fid=account.session?.fid;
  const profile=useQuery(()=>fid?api.profile(fid):Promise.resolve(undefined),[api,fid]);
  if(!fid)return <Notice title="Sign in to edit your profile"/>;
  if(profile.loading)return <Loading/>;
  if(profile.error||!profile.value)return <Notice title="Couldn’t load profile" retry={profile.reload}>{profile.error}</Notice>;
  return <ProfileEditor key={fid} profile={profile.value}/>;
}
