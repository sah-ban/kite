import { useEffect, useRef, type ReactNode } from 'react';
import { Check, AlertCircle, X } from 'lucide-react';
export function Toast({children,error=false,onDismiss}:{children:ReactNode;error?:boolean;onDismiss:()=>void}) {
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null),dismiss=useRef(onDismiss);dismiss.current=onDismiss;
  function stop(){if(timer.current)clearTimeout(timer.current);timer.current=null;}
  function start(){stop();if(!error)timer.current=setTimeout(()=>dismiss.current(),8000);}
  useEffect(()=>{start();return stop;},[children,error]);
  return <div className={`client-toast${error?' toast-error':''}`} role={error?'alert':'status'} onMouseEnter={stop} onMouseLeave={start} onFocus={stop} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))start();}}>
    {error?<AlertCircle size={19}/>:<Check size={19}/>}<div>{children}</div><button type="button" aria-label="Dismiss notification" onClick={onDismiss}><X size={18}/></button>
  </div>;
}
