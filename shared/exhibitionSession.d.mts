export interface ExhibitionSession {id:string;exhibition:string;active:boolean;version:string;updatedAt:string;updatedByName:string}
export function exhibitionOptionsWithDefault<T extends {label:string;value:string}>(options:T[],value:string):T[];
export function reviewExhibitionDefault(input:{session?:ExhibitionSession|null;recordValue?:string;fallback?:string}):string;
export function refreshReviewExhibition(current:string,nextDefault:string,edited:boolean):string;
