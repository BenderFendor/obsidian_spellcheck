import { App, PluginSettingTab, Setting } from 'obsidian';
import type ContextSpellcheckPlugin from './main';
import { DEFAULT_GRAMMAR_RULES, type OfflineGrammarRules } from './retext-grammar';

export interface SpellSettings {
  underlineMisspellings: boolean;
  offlineGrammarEnabled: boolean;
  underlineGrammar: boolean;
  grammarRules: OfflineGrammarRules;
  personalWords: string[];
  languageToolEnabled: boolean;
  languageToolUrl: string;
}
export const DEFAULT_SETTINGS: SpellSettings = {
  underlineMisspellings: true,
  offlineGrammarEnabled: true,
  underlineGrammar: false,
  grammarRules: { ...DEFAULT_GRAMMAR_RULES },
  personalWords: [],
  languageToolEnabled: false,
  languageToolUrl: 'http://127.0.0.1:8081/v2/check'
};
export class SpellSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: ContextSpellcheckPlugin) { super(app, plugin); }
  display(): void {
    this.containerEl.empty();
    new Setting(this.containerEl)
      .setName('Underline potential misspellings')
      .setDesc('Underline prose in the editor without changing note text.')
      .addToggle(toggle => toggle.setValue(this.plugin.settings.underlineMisspellings).onChange(async value => {
        this.plugin.settings.underlineMisspellings = value;
        await this.plugin.saveSettings();
      }));
    new Setting(this.containerEl)
      .setName('Personal dictionary')
      .setDesc('Comma- or line-separated terms to always accept, including names and specialist vocabulary.')
      .addTextArea(area => area.setValue(this.plugin.settings.personalWords.join('\n')).onChange(async value => {
        this.plugin.settings.personalWords = Array.from(new Set(value.split(/[,\n]/).map(w => w.trim().toLowerCase()).filter(Boolean)));
        await this.plugin.saveSettings();
      }));
    new Setting(this.containerEl).setName('Offline grammar (ReText)').setHeading();
    this.containerEl.createEl('p',{text:'Grammar runs locally using open-source ReText rules; no note text leaves your device. Spelling remains handled by the existing dictionary engine. All grammar changes require your approval.'});
    new Setting(this.containerEl)
      .setName('Enable offline grammar rules')
      .setDesc('Include grammar diagnostics in the review modal, without any server requests.')
      .addToggle(toggle => toggle.setValue(this.plugin.settings.offlineGrammarEnabled).onChange(async value => {
        this.plugin.settings.offlineGrammarEnabled = value;
        await this.plugin.saveSettings();
      }));
    new Setting(this.containerEl)
      .setName('Underline grammar issues in the editor')
      .setDesc('Off by default to avoid extra work on large notes. Enable for inline diagnostics.')
      .addToggle(toggle => toggle.setValue(this.plugin.settings.underlineGrammar).onChange(async value => {
        this.plugin.settings.underlineGrammar = value;
        await this.plugin.saveSettings();
      }));
    const ruleLabels: Array<[keyof OfflineGrammarRules,string,string]> = [
      ['articles','A / an agreement','Detect incorrect indefinite articles, including pronunciation exceptions.'],
      ['repeatedWords','Repeated words','Detect accidental repetitions, skipping conventional repeated expressions.'],
      ['redundantAcronyms','Redundant acronyms','Flag phrases such as ATM machine.'],
      ['passiveVoice','Passive voice (style)','Optional stylistic advice; disabled by default and never auto-rewrites.'],
    ];
    for (const [id, label, desc] of ruleLabels) {
      new Setting(this.containerEl)
        .setName(label).setDesc(desc)
        .addToggle(toggle => toggle.setValue(this.plugin.settings.grammarRules[id]).onChange(async value => {
          this.plugin.settings.grammarRules[id] = value;
          await this.plugin.saveSettings();
        }));
    }
    new Setting(this.containerEl).setName('Optional LanguageTool server').setHeading();
    this.containerEl.createEl('p',{text:'The built-in ReText grammar checks stay offline. LanguageTool is a separate optional server and sends reviewed text to the configured endpoint only when you explicitly click its button. Self-host LanguageTool for privacy.'});
    new Setting(this.containerEl)
      .setName('Allow LanguageTool checks')
      .setDesc('Disabled by default. An explicit action per review is still required to transmit any text.')
      .addToggle(toggle => toggle.setValue(this.plugin.settings.languageToolEnabled).onChange(async value => {
        this.plugin.settings.languageToolEnabled = value;
        await this.plugin.saveSettings();
      }));
    new Setting(this.containerEl)
      .setName('LanguageTool check endpoint')
      .setDesc('Example: http://127.0.0.1:8081/v2/check. Remote URLs send the reviewed text to that service.')
      .addText(text => text.setValue(this.plugin.settings.languageToolUrl).onChange(async value => {
        this.plugin.settings.languageToolUrl = value.trim();
        await this.plugin.saveSettings();
      }));
  }
}