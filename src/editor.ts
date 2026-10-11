import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { RangeSetBuilder, StateEffect } from '@codemirror/state';
import { SpellEngine, proseOnly } from './spelling';
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
      if(!settings.underlineMisspellings)return Decoration.none;
      const builder=new RangeSetBuilder<Decoration>();
      for(const {from,to} of view.visibleRanges){
        // Mask the prefix as well, so code fences starting above the viewport stay masked.
        const prose=proseOnly(view.state.doc.sliceString(0,to)).slice(from);
        for(const match of prose.matchAll(/[\p{L}]+(?:['’][\p{L}]+)*/gu)){
          const word=match[0],start=from+match.index,end=start+word.length;
          const sel=view.state.selection.main;
          if(sel.empty&&sel.from>=start&&sel.from<=end)continue;
          if(word.length<3||engine.isCorrect(word))continue;
          builder.add(start,end,Decoration.mark({class:'context-spellcheck-typo'}));
        }
      }
      return builder.finish();
    }
  },{decorations:value=>value.decorations});
}