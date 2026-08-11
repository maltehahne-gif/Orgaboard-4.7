# Spracharchitektur

Aktuell wird im Browser `SpeechRecognition`/`webkitSpeechRecognition` für Deutsch sowie `speechSynthesis` für die Ausgabe verwendet. Dadurch benötigt der Kern keine zusätzlichen Audiozugangsdaten.

Für garantierte plattformübergreifende Qualität sollte später ein serverseitiger Audio-Pfad ergänzt werden:

```text
Mikrofon -> MediaRecorder -> /assistant/transcribe -> STT-Anbieter
         -> Text -> OrgaBoard KI Tools -> Antworttext
         -> TTS-Anbieter oder Browser SpeechSynthesis
```

Ein externer STT/TTS-Dienst benötigt API-Zugang, Datenschutzprüfung und ggf. AV-Vertrag. Audio sollte standardmäßig nicht dauerhaft gespeichert werden.
