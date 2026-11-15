export type FeedVideoPlayer={play:()=>void;pause:()=>void};

// One focused, visible feed video owns autoplay. A manually paused video keeps
// ownership until it leaves view or the user starts a different video.
export function createVideoPlayback(){
  const visible=new Set<FeedVideoPlayer>();let owner:FeedVideoPlayer|undefined;
  function claim(player:FeedVideoPlayer){
    if(!visible.has(player))return false;
    if(owner&&owner!==player)owner.pause();owner=player;return true;
  }
  return {
    register(player:FeedVideoPlayer){
      visible.add(player);if(!owner){owner=player;player.play();}
      return()=>{
        visible.delete(player);player.pause();
        if(owner!==player)return;owner=undefined;
        // Let all screen-blur cleanups finish before considering the next clip.
        void Promise.resolve().then(()=>{if(owner)return;const next=visible.values().next().value;if(next){owner=next;next.play();}});
      };
    },
    play(player:FeedVideoPlayer){if(claim(player))player.play();},
    didPlay(player:FeedVideoPlayer){if(!claim(player))player.pause();},
  };
}
