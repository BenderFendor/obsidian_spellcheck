import { EditorView, ViewPlugin } from '@codemirror/view';
import { Editor, Menu, Notice } from 'obsidian';
import { SpellEngine, wordAtProse } from '../spelling';

type Target = { from:number; to:number; word:string; capturedAt:number };
const clickedWords=new WeakMap<EditorView,Target>();

/**
 * Obsidian's editor-menu callback exposes the editor cursor, but not the mouse
 * position. Capture the actual word under the right-click before the native
 * context-menu event bubbles to Obsidian, without changing the text selection.
 */
export function captureSpellingContextClick() {
  return ViewPlugin.fromClass(class {
    private readonly onContextMenu=(event:MouseEvent):void=>{
      const offset=this.view.posAtCoords({x:event.clientX,y:event.clientY});
      if(offset===null){clickedWords.delete(this.view);return;}
      const word=wordAtProse(this.view.state.doc.toString(),offset);
      if(word)clickedWords.set(this.view,{...word,capturedAt:Date.now()});
      else clickedWords.delete(this.view);
    };
    constructor(private readonly view:EditorView){
      view.dom.addEventListener('contextmenu',this.onContextMenu,true);
    }
    destroy():void{
      this.view.dom.removeEventListener('contextmenu',this.onContextMenu,true);
      clickedWords.delete(this.view);
    }
  });
}

export function populateSpellingContextMenu(
  menu:Menu,editor:Editor,engine:SpellEngine,addWord:(word:string)=>Promise<void>
):void {
  const view=(editor as Editor&{cm?:EditorView}).cm;
  const clicked=view?clickedWords.get(view):undefined;
  if(view)clickedWords.delete(view);
  const text=editor.getValue();
  // Keyboard context menus still use the current editor caret.
  const target=clicked&&Date.now()-clicked.capturedAt<1500
    ? clicked : wordAtProse(text,editor.posToOffset(editor.getCursor()));
  if(!target||text.slice(target.from,target.to)!==target.word||engine.isCorrect(target.word))return;
  const {from,to,word}=target;
  const suggestions=engine.suggest(word,text.slice(Math.max(0,from-80),from),text.slice(to,to+80),10);
  const apply=(candidate:string):void=>{
    if(editor.getValue()!==text){
      new Notice('The note changed. Open spelling suggestions again.');
      return;
    }
    editor.replaceRange(candidate,editor.offsetToPos(from),editor.offsetToPos(to));
  };
  menu.addSeparator();
  for(const suggestion of suggestions){
    menu.addItem(item=>item
      .setTitle('Replace "'+word+'" with "'+suggestion+'"')
      .setIcon('spell-check')
      .onClick(()=>apply(suggestion)));
  }
  menu.addItem(item=>item
    .setTitle('Add "'+word+'" to personal dictionary')
    .setIcon('book-plus')
    .onClick(()=>{void addWord(word);}));
}
