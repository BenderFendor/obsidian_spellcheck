import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';

const build=await esbuild.build({
  entryPoints:['src/spelling.ts'],bundle:true,platform:'node',format:'cjs',
  loader:{'.txt':'text'},write:false,logLevel:'silent'
});
const module={exports:{}};
new Function('module','exports',build.outputFiles[0].text)(module,module.exports);
const {SpellEngine,proseOnly,editDistance,wordAtProse}=module.exports;
const engine=new SpellEngine();
const cases=[
  ['pyhsoanylsis','psychoanalysis'],
  ['buroigious','bourgeois'],
  ['denpendcy','dependency'],
  ['matieral','material'],
  ['quuer','queer'],
  ['parthicial','patriarchal'],
  ['primative','primitive'],
  ['philosohy','philosophy'],
  ['intillectal','intellectual']
];
for(const [wrong,correct] of cases){
  const choices=engine.suggest(wrong,'marxist philosophy and psychoanalysis in material conditions','',10);
  assert(choices.includes(correct),wrong+' should suggest '+correct+': '+choices.join(', '));
}
assert.equal(editDistance('teh','the'),1);
assert.equal(engine.isCorrect('psychoanalysis'),true);
assert.equal(engine.isCorrect('Freud'),true);
assert.equal(engine.isCorrect('Marxism'),true);
assert.equal(engine.isCorrect('Lacan'),true);
// Contemporary people, places, organizations, technology and informal vocabulary.
for(const term of ['Sinwar','Netanyahu','Hamas','Hezbollah','UNRWA','Zelenskyy','ChatGPT','DeepSeek','Qwen','OpenAI','Obsidian','Bevy','Bluesky','doomscrolling','microplastics']){
  assert.equal(engine.isCorrect(term),true,term+' should be a known modern word');
}
assert.equal(engine.suggest('netyahuhu')[0],'Netanyahu');
assert(engine.suggest('sniwar').includes('Sinwar'));
assert(engine.suggest('hamaas').includes('Hamas'));
assert.equal(engine.check('Sinwar and Netanyahu discussed Hamas.').filter(x=>x.source==='spelling').length,0);
const clickText='The netyahuhu said '+String.fromCharCode(96)+'netyahuhu'+String.fromCharCode(96)+' about Hamas.';
assert.deepEqual(wordAtProse(clickText,clickText.indexOf('netyahuhu')+3),{
  from:clickText.indexOf('netyahuhu'),to:clickText.indexOf('netyahuhu')+9,word:'netyahuhu'
});
assert.equal(wordAtProse(clickText,clickText.lastIndexOf('netyahuhu')+3),null);
assert.equal(wordAtProse(clickText,clickText.indexOf('Hamas')+2)?.word,'Hamas');
const text='Freud and Marx write about matieral conditions. We have sense then discussed it.';
const issues=engine.check(text);
assert(issues.some(x=>x.original==='matieral'&&x.suggestions.includes('material')));
assert(issues.some(x=>x.original.toLowerCase()==='sense then'&&x.suggestions[0]==='since then'));
for(const issue of issues) assert.equal(text.slice(issue.from,issue.to),issue.original);
const markdown=['---','title: matieral','---','',
  'The matieral context is relevant.',
  '~~~js','const buroigious = 1;','~~~',
  'Also [my link](https://example.com/matieral) and [[buroigious]]',
  'Inline '+String.fromCharCode(96)+'matieral'+String.fromCharCode(96)
].join('\n');
const parsed=proseOnly(markdown);
assert.equal(parsed.length,markdown.length);
assert.equal(engine.check(markdown).filter(x=>x.original==='matieral').length,1);
engine.setIgnored(['matieral']);
assert.equal(engine.isCorrect('matieral'),true);
console.log('Offline spelling, modern 2026 vocabulary, and Markdown-offset regression tests passed ('+cases.length+' challenging typos).');
