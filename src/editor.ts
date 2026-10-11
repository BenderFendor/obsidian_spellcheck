import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { RangeSetBuilder, StateEffect } from '@codemirror/state';
import { SpellEngine, proseOnly } from './spelling';
import { offlineGrammarCheck } from './retext-grammar';
import type { SpellSettings } from './settings';

export const refreshSpellcheck=StateEffect.define<void>();
export function editorSpellcheck(engine:SpellEngine,settings:SpellSettings){
  return ViewPlugin.fromClass(class {
    decorations:DecorationSet;
    constructor(view:EditorView){this.decorations=this.build(view);}
    update(update:ViewUpdate):void{
      if(update.docChanged||update.viewportChanged||update.selectionSet||update.transactions.some(t=>t.effects.some(e=>e.is(refreshSpellcheck)))){
        this.decorations=this.build(update.view);
      }
    }
    build(view:EditorView):DecorationSet{
      if(!settings.underlineMisspellings&&(!settings.underlineGrammar||!settings.offlineGrammarEnabled))
        return Decoration.none;
      const spans:Array<{from:number;to:number;kind:'grammar'|'spelling'}>=[];
      const selected=view.state.selection.main;
      for(const {from,to} of view.visibleRanges){
        // Mask the prefix too: fences starting above a viewport stay masked.
        const prose=proseOnly(view.state.doc.sliceString(0,to)).slice(from);
        if(settings.offlineGrammarEnabled&&settings.underlineGrammar){
          for(const issue of offlineGrammarCheck(prose,settings.grammarRules,50)){
            const start=from+issue.from,end=from+issue.to;
            if(start<end)spans.push({from:start,to:end,kind:'grammar'});
          }
        }
        if(settings.underlineMisspellings){
          for(const match of prose.matchAll(/[\p{L}]+(?:['’][\p{L}]+)*/gu)){
            const word=match[0],start=from+match.index,end=start+word.length;
            if(selected.empty&&selected.from>=start&&selected.from<=end)continue;
            if(word.length<3||engine.isCorrect(word))continue;
            spans.push({from:start,to:end,kind:'spelling'});
          }
        }
      }
      // CodeMirror decorations require sorted, nonoverlapping ranges.
      spans.sort((a,b)=>a.from-b.from||b.to-a.to||(a.kind==='grammar'?-1:1));
      const builder=new RangeSetBuilder<Decoration>();
      let lastEnd=-1;
      for(const span of spans){
        if(span.from<lastEnd)continue;
        builder.add(span.from,span.to,Decoration.mark({
          class:span.kind==='grammar'?'context-spellcheck-grammar':'context-spellcheck-typo'
        }));
        lastEnd=span.to;
      }
      return builder.finish();
    }
  },{decorations:value=>value.decorations});
}
