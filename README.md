# Excel Übersetzungstool Copyright © 2024 Axel Schmidt

## Übersicht
Dieses Tool übersetzt automatisch deutsche Texte in Excel-Dateien ins Englische. Es erkennt alle Spalten, die mit '_DE' enden, und erstellt entsprechende englische Übersetzungen in neuen '_EN' Spalten.
Verwendet wird eine lokale Instanz von LibreTranslate.

## Voraussetzungen
Um das Tool nutzen zu können, benötigen Sie:
1. Windows 10 oder 11
2. Internetverbindung
3. Ca. 2 GB freien Speicherplatz

## Installation (Schritt für Schritt)

### 1. Docker Desktop installieren
1. Besuchen Sie die [Docker Desktop Website](https://www.docker.com/products/docker-desktop/)
2. Klicken Sie auf "Download for Windows"
3. Führen Sie die heruntergeladene Datei "Docker Desktop Installer.exe" aus
4. Folgen Sie dem Installationsassistenten
5. Starten Sie Ihren Computer neu, wenn Sie dazu aufgefordert werden
6. Nach dem Neustart erscheint das Docker-Symbol (ein Wal) in der Taskleiste

### 2. Node.js installieren
1. Besuchen Sie die [Node.js Website](https://nodejs.org/)
2. Laden Sie die "LTS" (Long Term Support) Version herunter
3. Führen Sie die heruntergeladene Datei aus
4. Folgen Sie dem Installationsassistenten (alle Standardeinstellungen können beibehalten werden)

### 3. Übersetzungstool herunterladen
1. Laden Sie dieses Tool als ZIP-Datei herunter
2. Entpacken Sie die ZIP-Datei in einen Ordner Ihrer Wahl (z.B. `C:\Excel-Translator`)

## Erste Einrichtung

### 1. Docker Desktop starten
1. Starten Sie Docker Desktop über das Symbol in der Taskleiste oder das Startmenü
2. Warten Sie, bis Docker vollständig gestartet ist (das Symbol zeigt dann "Docker Desktop is running")

### 2. Übersetzungsserver starten
1. Öffnen Sie die Windows-Eingabeaufforderung:
   - Drücken Sie `Windows + R`
   - Geben Sie `cmd` ein
   - Drücken Sie Enter
2. Navigieren Sie in den Ordner des Tools:
   ```
   cd C:\Excel-Translator
   ```
   (oder den Pfad, den Sie beim Entpacken gewählt haben)
3. Geben Sie folgenden Befehl ein:
   ```
   docker run -d -p 5555:5000 --name libretranslate -e LT_LOAD_ONLY=de,en libretranslate/libretranslate
   ```
4. Warten Sie etwa 2-3 Minuten, bis der Übersetzungsserver geladen ist

### 3. Abhängigkeiten installieren
In der gleichen Eingabeaufforderung:
```
npm install
```

## Excel-Datei vorbereiten
1. Öffnen Sie Ihre Excel-Datei
2. Stellen Sie sicher, dass alle deutschen Spalten, die übersetzt werden sollen, mit '_DE' enden
   - Beispiel: `Beschreibung_DE`, `Titel_DE`
3. Speichern Sie die Datei

## Übersetzung starten
1. Öffnen Sie die Eingabeaufforderung wie oben beschrieben
2. Navigieren Sie in den Tool-Ordner
3. Geben Sie ein:
   ```
   npm start "Pfad/zur/ihrer/Excel-Datei.xlsx"
   ```
   Beispiel:
   ```
   npm start "C:\Meine Dokumente\produkte.xlsx"
   ```
4. Warten Sie, bis die Übersetzung abgeschlossen ist
5. Die übersetzte Datei finden Sie im gleichen Ordner wie die Originaldatei mit dem Zusatz "_translated"
   - Beispiel: aus `produkte.xlsx` wird `produkte_translated.xlsx`

## Wichtige Hinweise
- Die Originaldatei wird nicht verändert
- Alle Formatierungen bleiben erhalten
- Spalten ohne '_DE' werden nicht verändert
- Der Übersetzungsserver muss nur einmal gestartet werden und läuft dann im Hintergrund
- Bei jedem Windows-Neustart muss Docker Desktop und der Übersetzungsserver neu gestartet werden

## Fehlerbehebung

### Docker Desktop startet nicht
1. Öffnen Sie die Windows-Einstellungen
2. Suchen Sie nach "Windows-Features aktivieren oder deaktivieren"
3. Aktivieren Sie "Windows-Subsystem für Linux" und "Virtual Machine Platform"
4. Starten Sie den Computer neu

### "command not found" Fehler
- Stellen Sie sicher, dass Sie sich im richtigen Ordner befinden
- Überprüfen Sie, ob Node.js korrekt installiert ist:
  ```
  node --version
  ```
  sollte eine Versionsnummer anzeigen

### Übersetzung funktioniert nicht
1. Überprüfen Sie, ob Docker läuft (Symbol in der Taskleiste)
2. Überprüfen Sie, ob der Übersetzungsserver läuft:
   ```
   docker ps
   ```
   sollte "libretranslate" anzeigen
3. Falls nicht, starten Sie den Server neu:
   ```
   docker start libretranslate
   ```

## Support
Bei technischen Problemen können Sie:
1. Ein Issue auf GitHub erstellen
2. Die technische Dokumentation in `TECHNICAL.md` konsultieren
3. Sich an Axel wenden
