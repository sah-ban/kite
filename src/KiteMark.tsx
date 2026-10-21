export function KiteMark({transparent=false}:{transparent?:boolean}) {
  return <img className="kite-mark" src={transparent?'/kite-mark-transparent-128.png':'/kite-icon-v7.png'} width="64" height="64" alt="" aria-hidden="true" draggable={false}/>;
}
