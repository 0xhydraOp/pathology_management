// Heights come from the same browser table/font/column widths used by the printed pages.
export function paginateReport(rows, measure, capacity) {
  if(!Number.isFinite(capacity) || capacity<1)throw new Error('No room for the report table');
  const pages=[[]];let used=0;
  const next=()=>{if(pages.at(-1).length){pages.push([]);used=0;}};
  const add=row=>{const height=measure(row.cells,row.continued?row.label:'');if(height>capacity+0.1)throw new Error('A report row cannot fit safely');pages.at(-1).push(row);used+=height;};
  for(const row of rows){
    const height=measure(row.cells);
    if(height<=capacity){if(used+height>capacity)next();add(row);continue;}
    next();const label=`Continued test #${row.index+1}: ${String(row.cells[0]).slice(0,40)}${String(row.cells[0]).length>40?'…':''}`;let remaining=row.cells.map(text=>Array.from(String(text))),continued=false;
    while(remaining.some(text=>text.length)){
      const cells=remaining.map(()=>''),counts=remaining.map(()=>0);
      for(let i=0;i<remaining.length;i++){
        let lo=0,hi=remaining[i].length;
        while(lo<hi){const mid=Math.ceil((lo+hi)/2),candidate=[...cells];candidate[i]=remaining[i].slice(0,mid).join('');if(measure(candidate,continued?label:'')<=capacity)lo=mid;else hi=mid-1;}
        counts[i]=lo;cells[i]=remaining[i].slice(0,lo).join('');
      }
      if(!counts.some(Boolean))throw new Error('Font/spacing leaves insufficient room even for one line');
      add({...row,cells,continued,label});remaining=remaining.map((text,i)=>text.slice(counts[i]));continued=true;
      if(remaining.some(text=>text.length))next();
    }
  }
  return pages.filter(page=>page.length);
}
