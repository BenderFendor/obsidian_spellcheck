import { requestUrl } from 'obsidian';
import type { Correction } from './spelling';
interface LTMatch {
  offset: number; length: number; message: string;
  replacements: Array<{value:string}>;
}
export async function languageToolCheck(text:string,endpoint:string):Promise<Correction[]> {
  const url=new URL(endpoint);
  if(!['http:','https:'].includes(url.protocol))throw new Error('LanguageTool URL must use HTTP or HTTPS');
  if(url.username||url.password)throw new Error('Do not put credentials in the LanguageTool URL');
  const response=await requestUrl({
    url:url.toString(),method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8'},
    body:new URLSearchParams({language:'en-US',text}).toString(),throw:false
  });
  if(response.status<200||response.status>=300)throw new Error('LanguageTool returned HTTP '+response.status);
  const body=response.json as {matches?:LTMatch[]};
  if(!Array.isArray(body.matches))throw new Error('Unexpected LanguageTool response');
  return body.matches.flatMap(match=>{
    const from=match.offset,to=from+match.length;
    if(!Number.isSafeInteger(from)||!Number.isSafeInteger(match.length)||from<0||to>text.length||to<=from)return [];
    const suggestions=match.replacements?.map(r=>r.value).filter(r=>typeof r==='string').slice(0,10)||[];
    if(!suggestions.length)return [];
    return [{from,to,original:text.slice(from,to),suggestions,message:match.message||'LanguageTool suggestion',source:'grammar' as const}];
  });
}