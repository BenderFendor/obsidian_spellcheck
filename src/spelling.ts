import lexicon from './data/lexicon.txt';

export interface Correction {
  from: number;
  to: number;
  original: string;
  suggestions: string[];
  message: string;
  source: 'spelling' | 'grammar';
}
const WORDS = /[\p{L}]+(?:['’][\p{L}]+)*/gu;
const SPECIAL = new Set([
  'marxism','marxist','marxists','marxian','psychoanalysis','psychoanalytic',
  'bourgeois','bourgeoisie','materialism','materialist','patriarchal',
  'dependency','imperialism','dialectical','ideological','freud','lacan',
  'jung','kant','marx','engels','hegel','gramsci','althusser','foucault',
  'fanon','deleuze','derrida','lenin','maoism'
]);
const COMMON_PAIRS: Record<string, string[]> = {
  material: ['conditions','analysis','world','reality'],
  social: ['relations','context','conditions'],
  historical: ['context','materialism','development'],
  psychoanalysis: ['freud','marxism','psychoanalytic'],
  individual: ['psychology','development'],
  class: ['struggle','relations','consciousness']
};
const CONTRACTIONS = /(?:n't|'s|'re|'ve|'ll|'d|'m)$/;
function masked(fragment: string): string { return fragment.replace(/[^\n]/g,' '); }
/** Mask Markdown constructs while preserving UTF-16 offsets. */
export function proseOnly(text: string): string {
  let result = text.replace(/^---\s*\n[\s\S]*?\n---(?=\s*\n)/, masked);
  result = result.replace(/(^|\n)([ \t]*)(\x60{3,}|~{3,})[^\n]*\n[\s\S]*?\n\2\3[^\n]*/g, masked);
  result = result.replace(/\x60+[^\x60\n]*\x60+/g, masked);
  result = result.replace(/!?\[\[[^\]\n]+\]\]/g, masked);
  result = result.replace(/!?\[[^\]\n]*\]\([^\n)]*\)/g, masked);
  result = result.replace(/https?:\/\/[^\s<>]+|\bwww\.[^\s<>]+/g, masked);
  result = result.replace(/(?:^|\s)#[\p{L}\p{N}_/-]+/gu, masked);
  result = result.replace(/<[^>\n]*>/g, masked);
  return result;
}
/** Optimal string alignment distance, including adjacent transpositions. */
export function editDistance(a: string,b: string): number {
  const n=a.length,m=b.length;
  let prev2=Array<number>(m+1).fill(0);
  let prev=Array.from({length:m+1},(_,i)=>i);
  for(let i=1;i<=n;i++){
    const row=Array<number>(m+1).fill(0);row[0]=i;
    for(let j=1;j<=m;j++){
      row[j]=Math.min(prev[j]!+1,row[j-1]!+1,
        prev[j-1]!+(a[i-1]===b[j-1]?0:1));
      if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1]){
        row[j]=Math.min(row[j]!,prev2[j-2]!+1);
      }
    }
    prev2=prev;prev=row;
  }
  return prev[m]!;
}
function deletions(word:string):Set<string>{
  const all=new Set([word.slice(0,7)]);
  let level=[word.slice(0,7)];
  for(let distance=0;distance<2;distance++){
    const next:string[]=[];
    for(const term of level)for(let i=0;i<term.length;i++){
      const d=term.slice(0,i)+term.slice(i+1);
      if(!all.has(d)){all.add(d);next.push(d);}
    }
    level=next;
  }
  return all;
}
function trigrams(word:string):Set<string>{
  const padded='^'+word+'$';const grams=new Set<string>();
  for(let i=0;i<=padded.length-3;i++)grams.add(padded.slice(i,i+3));
  return grams;
}
function matchCase(source:string,candidate:string):string{
  if(source===source.toUpperCase())return candidate.toUpperCase();
  if(source[0]===source[0]?.toUpperCase())return candidate[0]!.toUpperCase()+candidate.slice(1);
  return candidate;
}
export class SpellEngine {
  private frequency=new Map<string,number>();
  private deletes:Map<string,string[]>|null=null;
  private gramIndex:Map<string,string[]>|null=null;
  private suggestionCache=new Map<string,string[]>();
  private ignored=new Set<string>();
  constructor(customWords:string[]=[]){
    for(const line of lexicon.split('\n')){
      const space=line.lastIndexOf(' ');
      if(space>0)this.frequency.set(line.slice(0,space),Number(line.slice(space+1))||1);
    }
    for(const word of SPECIAL)this.frequency.set(word,Math.max(40,this.frequency.get(word)||0));
    this.setIgnored(customWords);
  }
  setIgnored(words:string[]):void{
    this.ignored=new Set(words.map(w=>w.toLocaleLowerCase().trim()).filter(Boolean));
    this.suggestionCache.clear();
  }
  isCorrect(token:string):boolean{
    const lower=token.toLocaleLowerCase().replace(/’/g,"'");
    if(lower.length<3||/\d|_/.test(lower))return true;
    if(this.ignored.has(lower)||this.frequency.has(lower))return true;
    if(CONTRACTIONS.test(lower)&&/^[a-z]+$/.test(lower.replace(CONTRACTIONS,'')))return true;
    if(lower.endsWith('s')&&this.frequency.has(lower.slice(0,-1)))return true;
    if(lower.endsWith('es')&&this.frequency.has(lower.slice(0,-2)))return true;
    if(lower.endsWith('ed')&&(this.frequency.has(lower.slice(0,-2))||this.frequency.has(lower.slice(0,-1))))return true;
    if(lower.endsWith('ing')&&(this.frequency.has(lower.slice(0,-3))||this.frequency.has(lower.slice(0,-3)+'e')))return true;
    return false;
  }
  private ensureDeletes():void{
    if(this.deletes)return;
    this.deletes=new Map();
    for(const [word,count] of this.frequency){
      if(count<2||word.length>28||word.includes("'"))continue;
      for(const deletion of deletions(word)){
        const array=this.deletes.get(deletion);
        if(array)array.push(word);
        else this.deletes.set(deletion,[word]);
      }
    }
  }
  private ensureGrams():void{
    if(this.gramIndex)return;
    this.gramIndex=new Map();
    for(const word of this.frequency.keys()){
      if(word.length<4||word.length>32||word.includes("'"))continue;
      for(const gram of trigrams(word)){
        const array=this.gramIndex.get(gram);
        if(array)array.push(word);
        else this.gramIndex.set(gram,[word]);
      }
    }
  }
  private candidates(word:string):string[]{
    const saved=this.suggestionCache.get(word);
    if(saved)return saved;
    this.ensureDeletes();
    const found=new Set<string>();
    for(const deletion of deletions(word)){
      for(const candidate of this.deletes?.get(deletion)||[]){
        if(Math.abs(candidate.length-word.length)<=2&&editDistance(word,candidate)<=2)found.add(candidate);
      }
    }
    if(found.size<10&&word.length>=5){
      this.ensureGrams();
      const counts=new Map<string,number>();
      for(const gram of trigrams(word))for(const candidate of this.gramIndex?.get(gram)||[]){
        if(Math.abs(candidate.length-word.length)<=5)counts.set(candidate,(counts.get(candidate)||0)+1);
      }
      const limit=Math.min(6,Math.max(3,Math.floor(word.length/2)));
      for(const [candidate] of Array.from(counts).sort((a,b)=>b[1]-a[1]).slice(0,160)){
        if(editDistance(word,candidate)<=limit)found.add(candidate);
      }
    }
    // Search specialist vocabulary even when a word has many errors.
    for(const term of SPECIAL)if(Math.abs(term.length-word.length)<=5&&editDistance(word,term)<=6)found.add(term);
    const value=Array.from(found);
    if(this.suggestionCache.size>400)this.suggestionCache.clear();
    this.suggestionCache.set(word,value);
    return value;
  }
  suggest(token:string,before='',after='',limit=10):string[]{
    const word=token.toLocaleLowerCase();
    if(!/^[a-z'-]{3,32}$/.test(word)||this.isCorrect(word))return [];
    const context=(before+' '+after).toLocaleLowerCase();
    const nearby=new Set(context.match(/[a-z]+/g)||[]);
    const inDomain=/marxis|psycho|philosoph|freud|lacan|material|bourgeois|politic|jung|kant/.test(context);
    const score=(candidate:string):number=>{
      const dist=editDistance(word,candidate),freq=this.frequency.get(candidate)||1;
      let result=Math.log1p(freq)*3-11*dist;
      if(SPECIAL.has(candidate)&&inDomain){
        const a=trigrams(word),b=trigrams(candidate);let shared=0;
        for(const gram of a)if(b.has(gram))shared++;
        if(dist<=2)result+=12;
        else if(dist<=6){
          const big=new Set(Array.from({length:word.length-1},(_,i)=>word.slice(i,i+2)));
          let overlap=0;
          for(let i=0;i+1<candidate.length;i++)if(big.has(candidate.slice(i,i+2)))overlap++;
          if(shared>=2)result+=45;
          else if(overlap>=3&&word[0]===candidate[0]&&word.slice(-1)===candidate.slice(-1))result+=65;
        }
      }
      if(candidate[0]===word[0])result+=3;
      if(candidate.slice(-3)===word.slice(-3))result+=3;
      for(const [contextWord,linked] of Object.entries(COMMON_PAIRS)){
        if(nearby.has(contextWord)&&linked.includes(candidate))result+=7;
        if(candidate===contextWord&&linked.some(other=>nearby.has(other)))result+=7;
      }
      return result;
    };
    return this.candidates(word).sort((a,b)=>score(b)-score(a)).slice(0,Math.max(1,Math.min(10,limit))).map(w=>matchCase(token,w));
  }
  check(text:string,limit=250):Correction[]{
    const prose=proseOnly(text);
    const matches=[...prose.matchAll(WORDS)];
    const corrections:Correction[]=[];
    for(let i=0;i<matches.length&&corrections.length<limit;i++){
      const match=matches[i]!,word=match[0];if(this.isCorrect(word))continue;
      const start=match.index;
      const before=prose.slice(Math.max(0,start-80),start);
      const after=prose.slice(start+word.length,start+word.length+80);
      const suggestions=word.toLowerCase()==='alot'?['a lot',...this.suggest(word,before,after,9)]:this.suggest(word,before,after);
      if(!suggestions.length)continue;
      corrections.push({from:start,to:start+word.length,original:word,suggestions,message:'Possible misspelling',source:'spelling'});
    }
    const rules:Array<[RegExp,(m:RegExpExecArray)=>string,string]>=[
      [/\b(?:to|would|could|should|will|can|must)\s+safe\b/gi,m=>m[0].replace(/safe$/i,'save'),'After a modal or "to", use the verb "save"'],
      [/\bsense then\b/gi,()=>'since then','Possible word confusion'],
      [/\b(isn't|wasn't)\s+no\s+longer\b/gi,m=>m[1]!.toLowerCase()==="isn't"?'is no longer':'was no longer','Possible double negative'],
      [/\b([a-z]{3,})\s+\1\b/gi,m=>m[1]!,'Repeated word'],
      [/\s+([,;:.!?])/g,m=>m[1]!,'Remove space before punctuation']
    ];
    for(const [regex,replacement,message] of rules){
      for(const m of prose.matchAll(regex)){
        if(corrections.length>=limit)break;
        const from=m.index,to=from+m[0].length,corrected=replacement(m);
        if(corrected===m[0]||corrections.some(c=>from<c.to&&to>c.from))continue;
        corrections.push({from,to,original:text.slice(from,to),suggestions:[corrected],message,source:'grammar'});
      }
    }
    return corrections.sort((a,b)=>a.from-b.from);
  }
}