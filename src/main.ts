import { EditorView } from '@codemirror/view';
import { MarkdownView, Notice, Plugin } from 'obsidian';
import { SpellEngine } from './spelling';
import { DEFAULT_GRAMMAR_RULES } from './retext-grammar';
import { DEFAULT_SETTINGS, SpellSettings, SpellSettingTab } from './settings';
import { editorSpellcheck, refreshSpellcheck } from './editor';
import { ReviewModal, SuggestionsModal } from './ui/review';
import { captureSpellingContextClick, populateSpellingContextMenu } from './ui/context-menu';

export default class ContextSpellcheckPlugin extends Plugin {
  settings!: SpellSettings;
  private engine!: SpellEngine;
  async onload(): Promise<void> {
    const saved=((await this.loadData())||{}) as Partial<SpellSettings>;
    this.settings={...DEFAULT_SETTINGS,...saved,grammarRules:{...DEFAULT_GRAMMAR_RULES,...saved.grammarRules}};
    this.settings.personalWords=Array.isArray(this.settings.personalWords)?this.settings.personalWords:[];
    this.engine=new SpellEngine(this.settings.personalWords);
    this.registerEditorExtension([editorSpellcheck(this.engine,this.settings),captureSpellingContextClick()]);
    this.addSettingTab(new SpellSettingTab(this.app,this));
    this.addCommand({
      id:'review-note-spelling',
      name:'Review spelling and grammar in selection or note',
      editorCallback:editor=>new ReviewModal(this.app,editor,this.engine,this.settings,word=>this.addWord(word)).open()
    });
    this.addCommand({
      id:'suggest-spelling-at-cursor',
      name:'Show spelling suggestions at cursor',
      editorCallback:editor=>new SuggestionsModal(this.app,editor,this.engine,word=>this.addWord(word)).open()
    });
    this.registerEvent(this.app.workspace.on('editor-menu',(menu,editor)=>{
      populateSpellingContextMenu(menu,editor,this.engine,word=>this.addWord(word),this.settings);
    }));
  }
  async addWord(word:string):Promise<void>{
    const normalized=word.trim().toLocaleLowerCase();
    if(!normalized||this.settings.personalWords.includes(normalized))return;
    this.settings.personalWords.push(normalized);
    await this.saveSettings();
    new Notice('Added "'+word+'" to your dictionary');
  }
  async saveSettings():Promise<void>{
    await this.saveData(this.settings);
    this.engine.setIgnored(this.settings.personalWords);
    this.refreshEditors();
  }
  refreshEditors():void{
    this.app.workspace.iterateAllLeaves(leaf=>{
      if(!(leaf.view instanceof MarkdownView))return;
      const editor=leaf.view.editor as typeof leaf.view.editor & {cm?:EditorView};
      editor.cm?.dispatch({effects:refreshSpellcheck.of(undefined)});
    });
  }
}