# Excel Übersetzungstool - Konzept und Implementierung

## Die Grundidee
Das Tool wurde entwickelt, um große Excel-Dateien mit deutschen Texten effizient und zuverlässig ins Englische zu übersetzen. Dabei standen folgende Kernziele im Fokus:

1. **Benutzerfreundlichkeit**: 
   - Einfache Installation und Bedienung
   - Keine Programmierkenntnisse erforderlich
   - Klare Fortschrittsanzeige

2. **Zuverlässigkeit**:
   - Keine Veränderung der Originaldatei
   - Automatische Speicherung von Zwischenergebnissen
   - Möglichkeit zur Fortsetzung nach Unterbrechung

3. **Effizienz**:
   - Parallele Verarbeitung mehrerer Übersetzungen
   - Vermeidung doppelter Übersetzungen
   - Optimierte Nutzung der verfügbaren Systemressourcen

## Technische Umsetzung

### Architektur
Das Tool basiert auf einer dreischichtigen Architektur:

1. **Datei-Verarbeitung**:
   - Lesen und Schreiben von Excel-Dateien
   - Erkennung der zu übersetzenden Spalten
   - Strukturerhaltung der Excel-Datei

2. **Übersetzungs-Engine**:
   - Lokale LibreTranslate-Installation via Docker
   - Parallele Übersetzungsanfragen
   - Intelligentes Retry-System

3. **Fortschritts-Management**:
   - Echtzeit-Fortschrittsanzeige
   - Automatische Zwischenspeicherung
   - Wiederaufnahme-Funktion

### Dateiverarbeitung im Detail

#### Einlesen der Datei
```javascript
// Beispiel der Implementierung
const workbook = readFile(inputPath);
const worksheet = workbook.Sheets[workbook.SheetNames[0]];
const jsonData = utils.sheet_to_json(worksheet);
```

#### Spaltenerkennung
- Automatische Erkennung von Spalten mit '_DE' Endung
- Konfigurierbare Ausnahmen (z.B. 'IPTC_DE_Credit')
- Erstellung entsprechender '_EN' Spalten

### Übersetzungsprozess

#### Optimierungen
1. **Deduplizierung**:
   - Sammeln aller einzigartigen Texte
   - Nur einmalige Übersetzung pro Text
   - Wiederverwendung bereits übersetzter Texte

2. **Batch-Verarbeitung**:
   - Gruppierung ähnlich langer Texte
   - Parallele Verarbeitung mehrerer Batches
   - Automatische Anpassung der Batch-Größe

3. **Ressourcen-Management**:
   - Anpassung an verfügbare CPU-Kerne
   - Optimierung des Speicherverbrauchs
   - Intelligentes Warteschlangen-System

### Fortschrittsverfolgung und Sicherheit

#### Checkpoint-System
```javascript
// Beispiel eines Checkpoints
{
    lastProcessedIndex: 1000,
    translations: Map<original, translated>
}
```

#### Speicherintervalle
- Alle 1000 Zeilen: Zwischenergebnis in Excel
- Regelmäßige Checkpoints für Wiederaufnahme
- Finale Version mit '_FINAL' Kennzeichnung

## Besondere Funktionen

### Intelligente Fehlerbehandlung
1. **Netzwerkfehler**:
   - Automatische Wiederholung
   - Exponentielles Backoff
   - Erhalt des Fortschritts

2. **Systemressourcen**:
   - Dynamische Anpassung der Last
   - Vermeidung von Speicherüberläufen
   - Optimierte Performance

### Fortschrittsanzeige
- Prozentuale Fortschrittsanzeige
- Geschätzte Restzeit
- Verarbeitungsgeschwindigkeit (Zeilen/Sekunde)

## Konfiguration und Anpassung

### Umgebungsvariablen
```bash
LIBRETRANSLATE_API_URL=http://localhost:5555
```

### Konfigurierbare Parameter
- Batch-Größe
- Anzahl paralleler Übersetzungen
- Speicherintervalle
- Wiederholungsversuche

## Technische Voraussetzungen

### Software
- Node.js für die Ausführung
- Docker für LibreTranslate
- Excel-Bibliotheken (xlsx)

### Hardware-Empfehlungen
- Mindestens 2 CPU-Kerne
- 4 GB RAM oder mehr
- Stabile Internetverbindung

## Erweiterungsmöglichkeiten

### Geplante Funktionen
1. **Verarbeitung**:
   - Unterstützung weiterer Dateiformate
   - Verbesserte Parallelisierung
   - Intelligenteres Caching

2. **Benutzerfreundlichkeit**:
   - Grafische Benutzeroberfläche
   - Erweiterte Fortschrittsanzeige
   - Detailliertere Protokollierung

3. **Integration**:
   - API-Schnittstelle
   - Automatisierte Workflows
   - Batch-Verarbeitung mehrerer Dateien 