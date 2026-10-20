import { SlidersHorizontal, X } from 'lucide-react';
import { filterChips, removeFilter, type Filters } from './lib/feed-filters';

export function FeedToolbar({filters,onChange,onOpen,order,onOrder,likes=false,indexed=false,following=false}:{filters:Filters;onChange:(filters:Filters)=>void;onOpen:()=>void;order:'newest'|'oldest';onOrder:(order:'newest'|'oldest')=>void;likes?:boolean;indexed?:boolean;following?:boolean}) {
  const chips=filterChips(filters);
  return <div className="feed-toolbar-wrap">
    <div className="feed-toolbar">
      <select className="feed-order" aria-label={likes?'Like order':'Chronological order'} value={order} onChange={event=>onOrder(event.target.value as 'newest'|'oldest')}><option value="newest">{likes?'Recently liked':'Newest first'}</option><option value="oldest">{likes?'Oldest likes first':following&&!indexed?'Oldest loaded first':'Oldest first'}</option></select>
      <button className={`filter-button${chips.length?' filter-active':''}`} aria-haspopup="dialog" onClick={onOpen}><SlidersHorizontal size={17}/>Filters{chips.length>0&&<span className="filter-count">{chips.length}</span>}</button>
    </div>
    {chips.length>0&&<div className="filter-chips" aria-label="Active client filters"><span className="filter-mode">{filters.mode==='include'?'Include':'Exclude'}</span>{chips.map(chip=><button key={chip.id} className="filter-chip" aria-label={`Remove ${chip.label} filter`} onClick={()=>onChange(removeFilter(filters,chip.id))}>{chip.label}<X size={13}/></button>)}<button className="clear-filters" onClick={()=>onChange({mode:'all',clientFids:'',signerKeys:'',selfRegistered:false})}>Clear all</button></div>}
  </div>;
}
