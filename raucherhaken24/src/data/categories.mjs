/**
 * Linke Kategorienavigation.
 * Hauptkategorien sind optisch klar von den Unterkategorien getrennt
 * (siehe .catnav-group / .catnav-sub in site.css).
 */

export const categories = [
  {
    slug: 'raeucherhaken',
    label: 'Räucherhaken',
    intro:
      'Räucherhaken halten Fisch und Fleisch sicher im Rauch. Welche Form Sie brauchen, hängt vor allem von Gewicht, Fischart und Aufhängung ab.',
    children: [
      { slug: 'raeucherhaken-standard', label: 'Räucherhaken Standard' },
      { slug: 'raeucherhaken-kralle', label: 'Räucherhaken Kralle' },
      { slug: 'raeucherhaken-standard-aal', label: 'Räucherhaken Standard Aal' },
      { slug: 'raeucherhaken-doppeldorn', label: 'Räucherhaken Doppeldorn' },
      { slug: 'raeucherhaken-3-dorn', label: 'Räucherhaken 3-Dorn' },
      { slug: 'raeucherhaken-filet', label: 'Räucherhaken Filet' },
    ],
  },
  {
    slug: 'fleischerhaken',
    label: 'Fleischerhaken',
    intro:
      'Fleischerhaken tragen schwere Stücke wie Schinken, Bäuche und Nacken sicher an Stange oder Rohr.',
    children: [{ slug: 'fleischerhaken-s-form', label: 'Fleischerhaken S-Form 5 mm' }],
  },
  {
    slug: 'raeuchermehl',
    label: 'Räuchermehl',
    intro:
      'Das Räuchermehl bestimmt Aroma, Rauchintensität und Farbe. Jede Holzart gibt es bei uns in vier Körnungen.',
    children: [
      { slug: 'raeuchermehl-buche', label: 'Buche' },
      { slug: 'raeuchermehl-erle', label: 'Erle' },
      { slug: 'raeuchermehl-birke', label: 'Birke' },
      { slug: 'raeuchermehl-eiche', label: 'Eiche' },
      { slug: 'raeuchermehl-kirsche', label: 'Kirsche' },
    ],
  },
  {
    slug: 'raeucherlaugen',
    label: 'Räucherlaugen',
    intro:
      'Die Lake würzt, salzt und stabilisiert das Räuchergut. Fertige Räucherlaugen nehmen Ihnen das Abwiegen ab.',
    children: [
      { slug: 'raeucherlauge-forelle', label: 'Forelle' },
      { slug: 'raeucherlauge-aal', label: 'Aal' },
      { slug: 'raeucherlauge-lachs', label: 'Lachs' },
    ],
  },
  {
    slug: 'gewuerze',
    label: 'Gewürze',
    intro: 'Abgestimmte Gewürzmischungen für Fisch, Graved Lachs, Stremellachs und Fleisch.',
    children: [
      { slug: 'fischgewuerze', label: 'Fischgewürze' },
      { slug: 'graved-lachs-gewuerze', label: 'Graved-Lachs-Gewürze' },
      { slug: 'stremellachs', label: 'Stremellachs' },
      { slug: 'fleischgewuerze', label: 'Fleischgewürze' },
    ],
  },
  {
    slug: 'schinken-poekeln',
    label: 'Schinken & Pökeln',
    intro:
      'Pökelmischungen für klassische Schinkenarten. Dosierung und Pökeldauer immer nach der Angabe auf der jeweiligen Packung.',
    children: [
      { slug: 'lachsschinken', label: 'Lachsschinken' },
      { slug: 'schwarzwaelder-art', label: 'Schwarzwälder Art' },
      { slug: 'parma-art', label: 'Parma Art' },
      { slug: 'serrano-art', label: 'Serrano Art' },
      { slug: 'rindersaftschinken', label: 'Rindersaftschinken' },
    ],
  },
];

/** Wissensbereich - erscheint als eigener Block unter den Shop-Kategorien. */
export const knowledgeNav = {
  slug: 'raeucherwissen',
  label: 'Räucherwissen',
  children: [
    { slug: 'fisch-raeuchern', label: 'Fisch räuchern' },
    { slug: 'fleisch-raeuchern', label: 'Fleisch räuchern' },
    { slug: 'schinken-selber-machen', label: 'Schinken selber machen' },
    { slug: 'raeuchermehl-verstehen', label: 'Räuchermehl verstehen' },
    { slug: 'va-v2a-v4a', label: 'VA / V2A / V4A' },
    { slug: 'temperaturen', label: 'Temperaturen' },
    { slug: 'raeucherzeiten', label: 'Räucherzeiten' },
    { slug: 'anfaengerwissen', label: 'Anfängerwissen' },
  ],
};

/** Flache Suche: Unterkategorie-Slug -> Hauptkategorie */
export function findCategoryBySub(subSlug) {
  for (const cat of categories) {
    if (cat.children.some((c) => c.slug === subSlug)) return cat;
  }
  return null;
}
