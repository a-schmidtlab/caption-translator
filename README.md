# Excel Übersetzungstool 
© 2025 Axel Schmidt

## Übersicht
Mit diesem Tool kannst du ganz einfach deutsche Texte in deinen Excel-Dateien automatisch ins Englische übersetzen lassen. Das Tool erkennt dabei alle Spalten, die mit '_DE' enden, und erstellt automatisch die entsprechenden englischen Übersetzungen in neuen '_EN' Spalten.
Dafür nutzen wir eine lokale Instanz von LibreTranslate.

## Voraussetzungen
Damit du loslegen kannst, brauchst du:
1. Windows 10 oder 11
2. Eine Internetverbindung
3. Ungefähr 2 GB freien Speicherplatz

## Installation (Schritt für Schritt)

### 1. Docker Desktop installieren
1. Geh auf die [Docker Desktop Website](https://www.docker.com/products/docker-desktop/)
2. Klick auf "Download for Windows"
3. Führe die heruntergeladene "Docker Desktop Installer.exe" aus
4. Folge einfach dem Installationsassistenten
5. Start deinen Computer neu, wenn du dazu aufgefordert wirst
6. Nach dem Neustart siehst du das Docker-Symbol (ein Wal) in deiner Taskleiste

### 2. Node.js installieren
1. Besuch die [Node.js Website](https://nodejs.org/)
2. Lade dir die "LTS" (Long Term Support) Version runter
3. Führe die heruntergeladene Datei aus
4. Folge dem Installationsassistenten (du kannst alle Standardeinstellungen so lassen)

### 3. Übersetzungstool herunterladen
1. Lade dir das Tool als ZIP-Datei runter
2. Entpack die ZIP-Datei in einen Ordner deiner Wahl (z.B. `C:\Excel-Translator`)

## Erste Einrichtung

### 1. Docker Desktop starten
1. Start Docker Desktop über das Symbol in der Taskleiste oder das Startmenü
2. Warte kurz, bis Docker komplett hochgefahren ist (das Symbol zeigt dann "Docker Desktop is running")

### 2. Übersetzungsserver starten
1. Öffne die Windows-Eingabeaufforderung:
   - Drück `Windows + R`
   - Gib `cmd` ein
   - Drück Enter
2. Navigier in den Ordner des Tools:
   ```
   cd C:\Excel-Translator
   ```
   (oder den Pfad, den du beim Entpacken gewählt hast)
3. Gib diesen Befehl ein:
   ```
   docker run -d -p 5555:5000 --name libretranslate -e LT_LOAD_ONLY=de,en libretranslate/libretranslate
   ```
4. Warte etwa 2-3 Minuten, bis der Übersetzungsserver geladen ist

### 3. Abhängigkeiten installieren
In der gleichen Eingabeaufforderung:
```
npm install
```

## Excel-Datei vorbereiten
1. Öffne deine Excel-Datei
2. Achte darauf, dass alle deutschen Spalten, die übersetzt werden sollen, mit '_DE' enden
   - Zum Beispiel: `Beschreibung_DE`, `Titel_DE`
3. Speicher die Datei

## Übersetzung starten
1. Öffne die Eingabeaufforderung wie oben beschrieben
2. Navigier in den Tool-Ordner
3. Gib ein:
   ```
   npm start "Pfad/zu/deiner/Excel-Datei.xlsx"
   ```
   Beispiel:
   ```
   npm start "C:\Meine Dokumente\produkte.xlsx"
   ```
4. Warte kurz, bis die Übersetzung fertig ist
5. Du findest die übersetzte Datei im gleichen Ordner wie die Originaldatei, nur mit dem Zusatz "_translated"
   - Beispiel: aus `produkte.xlsx` wird `produkte_translated.xlsx`

## Wichtige Hinweise
- Keine Sorge - deine Originaldatei bleibt unverändert
- Alle Formatierungen bleiben genau so, wie sie sind
- Spalten ohne '_DE' werden nicht angerührt
- Den Übersetzungsserver musst du nur einmal starten, dann läuft er im Hintergrund
- Nach jedem Windows-Neustart musst du Docker Desktop und den Übersetzungsserver neu starten

## Fehlerbehebung

### Docker Desktop startet nicht
1. Öffne die Windows-Einstellungen
2. Such nach "Windows-Features aktivieren oder deaktivieren"
3. Aktivier "Windows-Subsystem für Linux" und "Virtual Machine Platform"
4. Start deinen Computer neu

### "command not found" Fehler
- Check, ob du im richtigen Ordner bist
- Überprüf, ob Node.js richtig installiert ist:
  ```
  node --version
  ```
  Das sollte dir eine Versionsnummer anzeigen

### Übersetzung funktioniert nicht
1. Schau nach, ob Docker läuft (Symbol in der Taskleiste)
2. Überprüf, ob der Übersetzungsserver läuft:
   ```
   docker ps
   ```
   Hier sollte "libretranslate" angezeigt werden
3. Falls nicht, start den Server einfach neu:
   ```
   docker start libretranslate
   ```

## Support
Wenn's mal hakt, kannst du:
1. Ein Issue auf GitHub erstellen
2. In der technischen Dokumentation (`TECHNICAL.md`) nachschauen
3. Dich direkt an Axel wenden
