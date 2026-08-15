export const APP_VERSION = '1.1.0'

export type ChangelogEntry = {
  version: string
  date: string
  notes: string[]
}

// Neueste Version zuerst. Kurze, fachliche Sätze - das hier lesen Vertriebs-
// partner, keine Entwickler.
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.1.0',
    date: '15.08.2026',
    notes: [
      'Dashboard: Schnellzugriff (Neuer Kunde, Termin planen, Neuer Verkauf, Route erstellen) funktioniert jetzt',
      'Dashboard: Wochenwechsel bei den Terminen repariert, echte Umsatzentwicklung statt Platzhalterwert',
      'Verkäufe: Teamleiter können ein Storno rückgängig machen; Excel-Export der Verkaufsdaten',
      'Teamstatistiken: Excel-Export',
      'Nachfassen: neue Wiedervorlage lässt sich jetzt auch manuell anlegen',
      'Chat: eigene Nachrichten bearbeiten und löschen, Bilder in Vollbildansicht mit Galerie',
      'OrgaBoard lässt sich als App installieren (Startbildschirm-Symbol, Startbildschirm)',
      'Gründe für Termine ohne Abschluss werden erfasst und in der Kundenhistorie angezeigt',
      'Diese Versionsübersicht',
    ],
  },
  {
    version: '1.0.0',
    date: '14.08.2026',
    notes: [
      'Verkauf stornieren statt löschen - bleibt nachvollziehbar erhalten',
      'Produkte archivieren statt löschen; Erinnerung vor Verleih-Rückgabe und Warnung bei Überfälligkeit',
      'Chat: Gesendet- und Gelesen-Status',
      'CRM-Fundament: Kundenakte mit Timeline, Wiedervorlagen, Verkaufstrichter und Kennzahlen',
      'Sicherheitsfixes (CSRF-Schutz, Reset-Link, Login-Sperre) und überarbeitete Handy-/Tablet-Ansicht',
    ],
  },
]
