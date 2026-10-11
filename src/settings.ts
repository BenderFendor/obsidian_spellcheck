import { App, PluginSettingTab, Setting } from 'obsidian';
import type ContextSpellcheckPlugin from './main';

export interface SpellSettings {
  underlineMisspellings: boolean;
  personalWords: string[];
  languageToolEnabled: boolean;
  languageToolUrl: string;
}
export const DEFAULT_SETTINGS: SpellSettings = {
  underlineMisspellings: true,
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
    new Setting(this.containerEl).setName('Optional contextual grammar checks').setHeading();
    this.containerEl.createEl('p',{text:'Local spelling never sends notes anywhere. LanguageTool checks send the reviewed text to the configured endpoint only after you click Run grammar check. Self-host LanguageTool for privacy.'});
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