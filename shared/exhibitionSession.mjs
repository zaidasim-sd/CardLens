// Shared defaults prefill forms. A scanner's edited value always remains local
// to that record and is never a write to the administrator's session setting.
export function exhibitionOptionsWithDefault(options, value) {
 if(!value||options.some(option=>option.value===value))return options;
 const next=[...options],other=next.findIndex(option=>option.value==='Other / Source');
 next.splice(other<0?next.length:other,0,{label:value,value});return next;
}
export function reviewExhibitionDefault({session,recordValue,fallback=''}) {
 return session?.active?session.exhibition:recordValue||fallback;
}
export function refreshReviewExhibition(current, nextDefault, edited) {
 return edited?current:nextDefault||current;
}
