'use strict';
/*
 * GastelAI-Link — Obsidian-Plugin
 *
 * Öffnet die gerade angezeigte Notiz in der Online-Fassung des Vaults
 * (GastelAI / akb-vault: `/?datei=<pfad>`, akb-memory: `/notizen?pfad=<pfad>`
 * oder eine eigene Vorlage). Kein Build-Schritt: diese Datei ist das Plugin.
 */
const obsidian = require('obsidian');

const TARGETS = {
  files: { label: 'GastelAI – Bereich „Dateien“ (/?datei=…)', template: '{base}/?datei={path}' },
  notes: { label: 'akb-memory – Leseansicht (/notizen?pfad=…)', template: '{base}/notizen?pfad={path}' },
  custom: { label: 'Eigene Vorlage', template: '' },
};

const OPEN_MODES = {
  external: 'Externer Browser',
  tab: 'Obsidian-Web-Viewer (neuer Tab)',
  split: 'Obsidian-Web-Viewer (rechts daneben)',
};

const DEFAULT_SETTINGS = {
  baseUrl: '',
  openIn: 'external',
  target: 'files',
  customTemplate: '{base}/?datei={path}',
  pathPrefix: '',
  showHeaderButton: true,
  showStatusBar: true,
  showRibbon: false,
};

const ACTION_CLASS = 'gastelai-link-action';

/** Vault-Pfad in Obsidian → Pfad im Online-Vault (Präfix abschneiden). `null` = liegt außerhalb. */
function mapPath(filePath, prefix) {
  const p = String(filePath || '').replace(/^\/+/, '');
  const pre = String(prefix || '').trim().replace(/^\/+|\/+$/g, '');
  if (!pre) return p;
  if (p === pre || !p.startsWith(pre + '/')) return null;
  return p.slice(pre.length + 1);
}

/** Link bauen. Platzhalter: {base} {path} {pathNoExt} {name} {basename} (alle außer {base} URL-kodiert). */
function buildUrl(settings, filePath) {
  const base = String(settings.baseUrl || '').trim().replace(/\/+$/, '');
  if (!base) return null;
  const mapped = mapPath(filePath, settings.pathPrefix);
  if (mapped === null || mapped === '') return null;
  // Die Leseansicht von akb-memory zeigt nur Notizen.
  if (settings.target === 'notes' && !/\.md$/i.test(mapped)) return null;
  const tpl = settings.target === 'custom'
    ? String(settings.customTemplate || '').trim()
    : (TARGETS[settings.target] || TARGETS.files).template;
  if (!tpl) return null;
  const file = mapped.split('/').pop();
  const basename = file.replace(/\.[^.]*$/, '');
  const values = {
    base,
    path: encodeURIComponent(mapped),
    pathNoExt: encodeURIComponent(mapped.replace(/\.md$/i, '')),
    name: encodeURIComponent(file),
    basename: encodeURIComponent(basename),
  };
  return tpl.replace(/\{(base|path|pathNoExt|name|basename)\}/g, (_, k) => values[k]);
}

class GastelaiLinkPlugin extends obsidian.Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.ribbonEl = null;
    this.statusEl = null;

    this.addCommand({
      id: 'open-in-gastelai',
      name: 'Aktuelle Notiz in GastelAI öffnen',
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file) return false;
        if (!checking) this.openFile(file);
        return true;
      },
    });
    this.addCommand({
      id: 'copy-gastelai-link',
      name: 'GastelAI-Link der aktuellen Notiz kopieren',
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file) return false;
        if (!checking) this.copyLink(file);
        return true;
      },
    });

    this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {
      if (!(file instanceof obsidian.TFile)) return;
      menu.addItem((item) => item.setTitle('In GastelAI öffnen').setIcon('globe')
        .onClick(() => this.openFile(file)));
      menu.addItem((item) => item.setTitle('GastelAI-Link kopieren').setIcon('link')
        .onClick(() => this.copyLink(file)));
    }));

    this.registerEvent(this.app.workspace.on('layout-change', () => this.refresh()));
    this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.refresh()));
    this.registerEvent(this.app.workspace.on('file-open', () => this.refresh()));

    this.addSettingTab(new GastelaiLinkSettingTab(this.app, this));
    this.app.workspace.onLayoutReady(() => this.applyUi());
  }

  onunload() {
    this.removeHeaderButtons();
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.applyUi();
  }

  urlFor(file) {
    return file ? buildUrl(this.settings, file.path) : null;
  }

  explainMissing(file) {
    if (!String(this.settings.baseUrl || '').trim()) {
      return 'GastelAI-Link: bitte zuerst in den Einstellungen die Adresse der Online-Fassung eintragen.';
    }
    if (file && mapPath(file.path, this.settings.pathPrefix) === null) {
      return 'GastelAI-Link: diese Datei liegt außerhalb des eingestellten Ordners „'
        + this.settings.pathPrefix + '“.';
    }
    if (file && this.settings.target === 'notes' && !/\.md$/i.test(file.path)) {
      return 'GastelAI-Link: die Leseansicht von akb-memory zeigt nur Notizen (.md).';
    }
    return 'GastelAI-Link: für diese Datei lässt sich kein Link bilden.';
  }

  openFile(file) {
    const url = this.urlFor(file);
    if (!url) { new obsidian.Notice(this.explainMissing(file)); return; }
    this.openUrl(url);
  }

  /** Web-Viewer = Kern-Plugin „webviewer“ (Obsidian ≥ 1.8, nur Desktop). */
  webViewerAvailable() {
    if (obsidian.Platform && obsidian.Platform.isMobile) return false;
    const ip = this.app.internalPlugins;
    const wv = ip && typeof ip.getPluginById === 'function' ? ip.getPluginById('webviewer') : null;
    return !!(wv && wv.enabled);
  }

  async openUrl(url) {
    const mode = this.settings.openIn;
    if (mode === 'tab' || mode === 'split') {
      if (this.webViewerAvailable()) {
        try {
          const leaf = mode === 'split'
            ? this.app.workspace.getLeaf('split', 'vertical')
            : this.app.workspace.getLeaf('tab');
          await leaf.setViewState({ type: 'webviewer', state: { url, navigate: true }, active: true });
          this.app.workspace.revealLeaf(leaf);
          return;
        } catch (e) {
          console.warn('GastelAI-Link: Web-Viewer fehlgeschlagen, öffne extern', e);
        }
      } else {
        new obsidian.Notice('GastelAI-Link: Web-Viewer nicht verfügbar (Kern-Plugin „Web-Viewer“ aktivieren; '
          + 'auf dem Handy gibt es ihn nicht) — öffne im externen Browser.');
      }
    }
    window.open(url, '_blank');
  }

  async copyLink(file) {
    const url = this.urlFor(file);
    if (!url) { new obsidian.Notice(this.explainMissing(file)); return; }
    try {
      await navigator.clipboard.writeText(url);
      new obsidian.Notice('GastelAI-Link kopiert');
    } catch (e) {
      new obsidian.Notice('Kopieren fehlgeschlagen: ' + url);
    }
  }

  /* ── Oberfläche ─────────────────────────────────────────────────────── */

  applyUi() {
    if (this.settings.showRibbon && !this.ribbonEl) {
      this.ribbonEl = this.addRibbonIcon('globe', 'Aktuelle Notiz in GastelAI öffnen', () => {
        const file = this.app.workspace.getActiveFile();
        if (file) this.openFile(file); else new obsidian.Notice('Keine Notiz geöffnet');
      });
    } else if (!this.settings.showRibbon && this.ribbonEl) {
      this.ribbonEl.remove();
      this.ribbonEl = null;
    }

    if (this.settings.showStatusBar && !this.statusEl) {
      this.statusEl = this.addStatusBarItem();
      this.statusEl.addClass('gastelai-link-status', 'mod-clickable');
      this.statusEl.addEventListener('click', () => {
        const file = this.app.workspace.getActiveFile();
        if (file) this.openFile(file);
      });
    } else if (!this.settings.showStatusBar && this.statusEl) {
      this.statusEl.remove();
      this.statusEl = null;
    }

    this.removeHeaderButtons();
    this.refresh();
  }

  removeHeaderButtons() {
    this.app.workspace.iterateAllLeaves((leaf) => {
      const view = leaf.view;
      if (view && view.gastelaiLinkAction) {
        view.gastelaiLinkAction.remove();
        delete view.gastelaiLinkAction;
      }
    });
  }

  refresh() {
    if (this.settings.showHeaderButton) {
      this.app.workspace.iterateAllLeaves((leaf) => {
        const view = leaf.view;
        if (!(view instanceof obsidian.FileView) || typeof view.addAction !== 'function') return;
        if (view.gastelaiLinkAction && view.gastelaiLinkAction.isConnected) return;
        view.gastelaiLinkAction = view.addAction('globe', 'In GastelAI öffnen', () => {
          if (view.file) this.openFile(view.file);
        });
        view.gastelaiLinkAction.addClass(ACTION_CLASS);
      });
    }

    if (this.statusEl) {
      const file = this.app.workspace.getActiveFile();
      const url = this.urlFor(file);
      this.statusEl.setText('↗ GastelAI');
      this.statusEl.toggleClass('is-disabled', !url);
      this.statusEl.setAttr('aria-label', url ? 'In GastelAI öffnen: ' + url
        : (file ? this.explainMissing(file) : 'Keine Notiz geöffnet'));
      this.statusEl.style.display = file ? '' : 'none';
    }
  }
}

class GastelaiLinkSettingTab extends obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    const s = this.plugin.settings;
    containerEl.empty();

    new obsidian.Setting(containerEl)
      .setName('Adresse der Online-Fassung')
      .setDesc('Basis-URL ohne Pfad, z. B. https://gastelai.example.de')
      .addText((t) => t.setPlaceholder('https://…').setValue(s.baseUrl)
        .onChange(async (v) => { s.baseUrl = v.trim(); await this.plugin.saveSettings(); this.updatePreview(); }));

    new obsidian.Setting(containerEl)
      .setName('Link-Ziel')
      .setDesc('Welche Ansicht der Online-Fassung geöffnet wird.')
      .addDropdown((d) => {
        Object.entries(TARGETS).forEach(([k, v]) => d.addOption(k, v.label));
        d.setValue(s.target).onChange(async (v) => {
          s.target = v; await this.plugin.saveSettings(); this.display();
        });
      });

    new obsidian.Setting(containerEl)
      .setName('Öffnen in')
      .setDesc('Der Web-Viewer ist ein Kern-Plugin von Obsidian (ab 1.8, nur Desktop) und muss unter '
        + '„Kern-Plugins“ aktiviert sein; sonst und auf dem Handy öffnet der externe Browser. '
        + 'Im Web-Viewer meldest du dich einmal separat an.')
      .addDropdown((d) => {
        Object.entries(OPEN_MODES).forEach(([k, v]) => d.addOption(k, v));
        d.setValue(s.openIn).onChange(async (v) => { s.openIn = v; await this.plugin.saveSettings(); });
      });

    if (s.target === 'custom') {
      new obsidian.Setting(containerEl)
        .setName('Eigene Vorlage')
        .setDesc('Platzhalter: {base} {path} {pathNoExt} {name} {basename} — alle außer {base} werden URL-kodiert.')
        .addText((t) => t.setValue(s.customTemplate)
          .onChange(async (v) => { s.customTemplate = v; await this.plugin.saveSettings(); this.updatePreview(); }));
    }

    new obsidian.Setting(containerEl)
      .setName('Ordner im lokalen Vault (optional)')
      .setDesc('Nur nötig, wenn der Online-Vault einem Unterordner deines Obsidian-Vaults entspricht. '
        + 'Dieser Ordner wird vom Pfad abgeschnitten; Dateien außerhalb bekommen keinen Link.')
      .addText((t) => t.setPlaceholder('leer = ganzer Vault').setValue(s.pathPrefix)
        .onChange(async (v) => { s.pathPrefix = v.trim(); await this.plugin.saveSettings(); this.updatePreview(); }));

    new obsidian.Setting(containerEl)
      .setName('Knopf in der Kopfzeile der Notiz')
      .addToggle((t) => t.setValue(s.showHeaderButton)
        .onChange(async (v) => { s.showHeaderButton = v; await this.plugin.saveSettings(); }));
    new obsidian.Setting(containerEl)
      .setName('Link in der Statusleiste')
      .setDesc('Auf dem Handy gibt es keine Statusleiste — dort Kopfzeilen-Knopf oder Befehl nutzen.')
      .addToggle((t) => t.setValue(s.showStatusBar)
        .onChange(async (v) => { s.showStatusBar = v; await this.plugin.saveSettings(); }));
    new obsidian.Setting(containerEl)
      .setName('Symbol in der linken Leiste')
      .addToggle((t) => t.setValue(s.showRibbon)
        .onChange(async (v) => { s.showRibbon = v; await this.plugin.saveSettings(); }));

    this.previewEl = containerEl.createEl('p', { cls: 'setting-item-description' });
    this.updatePreview();
  }

  updatePreview() {
    if (!this.previewEl) return;
    const file = this.app.workspace.getActiveFile();
    const sample = file ? file.path : 'Ordner/Beispiel Notiz.md';
    const url = buildUrl(this.plugin.settings, sample);
    this.previewEl.setText('Vorschau für „' + sample + '“: ' + (url || '— (noch kein Link möglich)'));
  }
}

module.exports = GastelaiLinkPlugin;
module.exports.buildUrl = buildUrl;
module.exports.mapPath = mapPath;
