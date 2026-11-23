# GastelAI-Link (Obsidian-Plugin)

Öffnet die gerade angezeigte Notiz mit einem Klick in der Online-Fassung des Vaults — in GastelAI (akb-vault, Bereich „Dateien") oder in der Leseansicht von akb-memory. Adresse und Ziel sind einstellbar.

## Was es anzeigt

- **Knopf in der Kopfzeile jeder Notiz** (Globus-Symbol) — auch auf dem Handy, auch bei PDFs und Bildern
- **„↗ GastelAI" in der Statusleiste** (nur Desktop)
- optional ein **Symbol in der linken Leiste**
- **Rechtsklick auf eine Datei**: „In GastelAI öffnen" und „GastelAI-Link kopieren"
- **Befehle** (Befehlspalette, Tastenkürzel belegbar): „Aktuelle Notiz in GastelAI öffnen", „GastelAI-Link der aktuellen Notiz kopieren"

## Installation über BRAT (empfohlen, mit automatischen Updates)

1. In Obsidian unter *Einstellungen → Community-Plugins → Durchsuchen* das Plugin **BRAT** („Obsidian42 - BRAT") installieren und aktivieren.
2. In den BRAT-Einstellungen *Add Beta plugin* → `JonasPrade/gastelai-obsidian-button` eintragen → *Add Plugin*.
3. Unter *Community-Plugins* „GastelAI-Link" aktivieren und in dessen Einstellungen die Adresse eintragen.

BRAT holt neue Versionen beim Start von Obsidian bzw. über den Befehl *BRAT: Check for updates*. Das funktioniert auch auf iPhone/iPad. Das Repo ist öffentlich, ein GitHub-Token ist nicht nötig.

### Ohne BRAT

Aus dem neuesten [Release](../../releases/latest) `main.js`, `manifest.json` und `styles.css` nach `<Vault>/.obsidian/plugins/gastelai-link/` kopieren, Plugin-Liste neu laden und aktivieren.

## Einstellungen

| Einstellung | Bedeutung |
|---|---|
| Adresse der Online-Fassung | Basis-URL, z. B. `https://gastelai.example.de` |
| Link-Ziel | `GastelAI – Bereich „Dateien"` → `{base}/?datei=<pfad>` · `akb-memory – Leseansicht` → `{base}/notizen?pfad=<pfad>` (nur Notizen) · `Eigene Vorlage` |
| Öffnen in | externer Browser (Default; auf dem Desktop direkt der Systembrowser, auch wenn der Web-Viewer externe Links abfangen würde) · Obsidian-Web-Viewer im neuen Tab · Web-Viewer rechts daneben. Der Web-Viewer ist ein Kern-Plugin (Obsidian ≥ 1.8, nur Desktop) und muss unter *Kern-Plugins* aktiviert sein; sonst und auf dem Handy öffnet der externe Browser. Im Web-Viewer meldet man sich einmal separat an |
| Eigene Vorlage | Platzhalter `{base}` `{path}` `{pathNoExt}` `{name}` `{basename}`; alle außer `{base}` werden URL-kodiert |
| Ordner im lokalen Vault | nur nötig, wenn der Online-Vault einem Unterordner des Obsidian-Vaults entspricht — der Ordner wird vom Pfad abgeschnitten, Dateien außerhalb bekommen keinen Link |
| Knopf / Statusleiste / linke Leiste | einzeln ein- und ausschaltbar |

Unten in den Einstellungen steht eine Vorschau des Links für die gerade geöffnete Notiz.

## Was der Server können muss

Die Serverseite liegt im akb-Repo (`JonasPrade/obs_ai`):

- **GastelAI (akb-vault):** `/?datei=<vault-relativer Pfad>` öffnet die Datei im Bereich „Dateien" — `.md` im Reader, andere Dateien als Vorschau.
- **akb-memory:** `/notizen?pfad=<pfad>` (braucht `UI_NOTES_ENABLED=true`).
- **Anmeldung:** Ohne Sitzung geht es über `/login?next=…` zum Login und danach zurück zur Notiz. Ein `#Abschnitt` geht dabei verloren.

## Entwicklung

Kein Build-Schritt: `main.js` ist das Plugin.

```bash
npm test
```

prüft die Link-Bildung ohne Obsidian (`test_link.mjs`) und die Syntax von `main.js`.

### Neue Version veröffentlichen

1. Version in `manifest.json` und `package.json` erhöhen, in `versions.json` die Zeile `"<version>": "<minAppVersion>"` ergänzen.
2. Commit auf `main`, dann Tag ohne „v" setzen und pushen:

```bash
git tag 1.2.0
```

```bash
git push origin 1.2.0
```

Der Workflow `release` prüft, dass Tag und Manifest-Version übereinstimmen, und legt das Release mit `main.js`, `manifest.json` und `styles.css` an — daraus holt BRAT das Update.
