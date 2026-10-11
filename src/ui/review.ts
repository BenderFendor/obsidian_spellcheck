import { App, Editor, Modal, Notice } from 'obsidian';
import { Correction, SpellEngine, wordAtProse } from '../spelling';
import type { SpellSettings } from '../settings';
import { languageToolCheck } from '../grammar';

/** Reviewable replacements; changes only after a direct click. */
export class ReviewModal extends Modal {
  private issues:Correction[]=[];
  private remoteIssues:Correction[]=[];
  private skipped=new Set<string>();
  private initialText:string;
  private baseOffset:number;
  private status='';
  constructor(app:App,private readonly editor:Editor,private readonly engine:SpellEngine,
    private readonly settings:SpellSettings,private readonly saveWord:(word:string)=>Promise<void>){
    super(app);
    const selection=editor.getSelection();
    this.initialText=selection||editor.getValue();
    this.baseOffset=selection?editor.posToOffset(editor.getCursor('from')):0;
  }
  onOpen():void{this.render();}
  onClose():void{this.contentEl.empty();}
  private render():void{
    this.contentEl.empty();
    this.contentEl.addClass('context-spellcheck-review');
    this.contentEl.createEl('h2',{text:'Spelling and grammar review'});
    const toolbar=this.contentEl.createDiv({cls:'context-spellcheck-toolbar'});
    if(this.settings.languageToolEnabled){
      const remote=toolbar.createEl('button',{text:'Run grammar check'});
      remote.onclick=()=>{void this.runLanguageTool(remote);};
    }
    toolbar.createSpan({text:this.settings.languageToolEnabled?
      'Offline spelling. Grammar check sends the reviewed text to your configured endpoint.':
      'Offline spelling. Enable LanguageTool in settings for additional context-aware grammar suggestions.'});
    if(this.status)this.contentEl.createEl('p',{text:this.status});
    this.issues=this.engine.check(this.initialText);
    const key=(x:Correction)=>x.source+':'+x.from+':'+x.to+':'+x.original;
    const merged=[...this.issues,...this.remoteIssues].filter(x=>!this.skipped.has(key(x)))
      .sort((a,b)=>a.from-b.from||a.to-b.to);
    if(!merged.length){this.contentEl.createEl('p',{text:'No suggestions found.'});return;}
    this.contentEl.createEl('p',{text:merged.length+' suggestions. Select a replacement or add a term to your dictionary.'});
    const list=this.contentEl.createDiv({cls:'context-spellcheck-issues'});
    for(const issue of merged){
      const item=list.createDiv({cls:'context-spellcheck-issue'});
      const context=this.initialText.slice(Math.max(0,issue.from-45),Math.min(this.initialText.length,issue.to+45)).replace(/\s+/g,' ');
      item.createEl('strong',{text:issue.original||'Insertion'});
      item.createEl('small',{text:issue.message});
      item.createEl('div',{text:context,cls:'context-spellcheck-context'});
      const buttons=item.createDiv({cls:'context-spellcheck-choices'});
      for(const suggestion of issue.suggestions.slice(0,10)){
        const button=buttons.createEl('button',{text:suggestion});
        button.onclick=()=>this.apply(issue,suggestion);
      }
      if(issue.source==='spelling'){
        const add=buttons.createEl('button',{text:'Add to dictionary'});
        add.onclick=()=>{void this.saveWord(issue.original).then(()=>this.render());};
      }
      const ignore=buttons.createEl('button',{text:'Ignore'});
      ignore.onclick=()=>{this.skipped.add(key(issue));this.render();};
    }
  }
  private apply(issue:Correction,replacement:string):void{
    const from=this.baseOffset+issue.from,to=this.baseOffset+issue.to;
    const current=this.editor.getValue();
    if(current.slice(from,to)!==issue.original||
       current.slice(this.baseOffset,this.baseOffset+this.initialText.length)!==this.initialText){
      new Notice('The note changed during review. Reopen it to avoid editing the wrong text.');
      this.close();return;
    }
    this.editor.replaceRange(replacement,this.editor.offsetToPos(from),this.editor.offsetToPos(to));
    this.initialText=this.initialText.slice(0,issue.from)+replacement+this.initialText.slice(issue.to);
    this.remoteIssues=[];
    this.skipped.clear();
    this.status='Applied correction. Rerun grammar check if needed.';
    this.render();
  }
  private async runLanguageTool(button:HTMLButtonElement):Promise<void>{
    button.disabled=true;
    button.textContent='Checking…';
    const snapshot=this.initialText;
    try{
      const issues=await languageToolCheck(snapshot,this.settings.languageToolUrl);
      if(snapshot!==this.initialText)return;
      this.remoteIssues=issues;
      this.status='LanguageTool returned '+issues.length+' suggestions.';
      this.render();
    }catch(e){
      this.status='Grammar check failed: '+(e instanceof Error?e.message:String(e));
      this.render();
    }
  }
}
export class SuggestionsModal extends Modal {
  constructor(app:App,private readonly editor:Editor,private readonly engine:SpellEngine,
    private readonly saveWord:(word:string)=>Promise<void>){super(app);}
  onOpen():void{
    this.contentEl.empty();
    this.contentEl.createEl('h2',{text:'Spell suggestions'});
    const text=this.editor.getValue(),pos=this.editor.posToOffset(this.editor.getCursor());
    const target=wordAtProse(text,pos);
    if(!target){this.contentEl.createEl('p',{text:'Place the cursor inside a prose word.'});return;}
    const {from,to,word}=target;
    const suggestions=this.engine.suggest(word,text.slice(Math.max(0,from-80),from),text.slice(to,to+80),10);
    if(!suggestions.length){this.contentEl.createEl('p',{text:'No alternative spellings found for '+word+'.'});return;}
    this.contentEl.createEl('p',{text:'Possible corrections for "'+word+'":'});
    for(const suggestion of suggestions){
      const button=this.contentEl.createEl('button',{text:suggestion,cls:'context-spellcheck-option'});
      button.onclick=()=>{
        if(this.editor.getValue().slice(from,to)!==word){new Notice('Text changed. Retry suggestions.');return;}
        this.editor.replaceRange(suggestion,this.editor.offsetToPos(from),this.editor.offsetToPos(to));
        this.close();
      };
    }
    const add=this.contentEl.createEl('button',{text:'Add to dictionary'});
    add.onclick=()=>{void this.saveWord(word).then(()=>this.close());};
  }
  onClose():void{this.contentEl.empty();}
}