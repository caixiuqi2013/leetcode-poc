import {ContextSchema,contextFromUrl} from '../../../packages/shared/src/schema';
import {GOOGLE_RECENCIES,googleRecency} from '../../../packages/shared/src/recency';
export function readContext(){
 const c=contextFromUrl(location.href);
 const recency=googleRecency(c.recency.raw);
 const headings=[...document.querySelectorAll('h1')];
 const combos=[...document.querySelectorAll('[role="combobox"]')].filter(e=>Object.values(GOOGLE_RECENCIES).some(range=>range.label===(e.textContent?.trim()??'')));
 if(c.company.slug!=='google'||!recency)throw new Error('unsupported-scope');
 // The filter menu also exposes a Match=All combobox. It must not be confused with recency.
 const labels=combos.map(e=>e.textContent?.trim());
 if(headings.length!==1||headings[0].textContent?.trim()!=='Google'||!labels.includes(recency.label)||labels.some(label=>label!==recency.label&&label!=='All'))throw new Error('context-not-ready');
 return ContextSchema.parse({...c,company:{...c.company,name:'Google'},recency:{...c.recency,label:recency.label,days:recency.days}});
}
