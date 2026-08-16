/* Spiegelt FUNNEL_ORDER/FUNNEL_LABELS aus backend/app/services/timeline.py.
   Eine Stelle für die Reihenfolge der Trichterstufen, damit Kundenakte und
   Pipeline-Board nicht zwei verschiedene Listen pflegen. */

export const FUNNEL_ORDER = [
  'contact',
  'appointment_set',
  'appointment_done',
  'presentation',
  'offer',
  'sale',
  'aftercare',
] as const

export type FunnelStage = typeof FUNNEL_ORDER[number]

export const FUNNEL_LABELS: Record<FunnelStage, string> = {
  contact: 'Kontakt',
  appointment_set: 'Termin vereinbart',
  appointment_done: 'Termin durchgeführt',
  presentation: 'Vorführung',
  offer: 'Angebot',
  sale: 'Verkauf',
  aftercare: 'Nachbetreuung',
}

/* Kurzform für Spaltenköpfe im Pipeline-Board - dieselbe Reihenfolge, aber
   knapper, weil sieben volle Bezeichnungen nebeneinander nicht mehr passen. */
export const FUNNEL_COLUMN_LABELS: Record<FunnelStage, string> = {
  contact: 'Kontakt',
  appointment_set: 'Termin',
  appointment_done: 'Durchgeführt',
  presentation: 'Vorführung',
  offer: 'Angebot',
  sale: 'Verkauf',
  aftercare: 'Nachbetreuung',
}
