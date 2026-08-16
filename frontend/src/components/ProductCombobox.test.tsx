import {useState} from 'react'
import {cleanup, render, screen, fireEvent, within} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach, describe, expect, it, beforeEach, vi} from 'vitest'
import {ProductCombobox, ProduktEintrag} from './ProductCombobox'

/**
 * Die Fälle, an denen die alte Produktliste gescheitert ist – und die
 * Bedienung, die dabei nicht verlorengehen durfte.
 *
 * Wo die Prüfung an Pixeln hinge (jsdom rechnet kein Layout), steht sie
 * stellvertretend auf dem, was das Layout erzeugt: die Liste hängt im
 * `body` statt im Formular, sie bekommt eine begrenzte Höhe mit eigenem
 * Scrollbereich, und nach der Auswahl ist sie fort.
 */

const PRODUKTE: ProduktEintrag[] = [
  {id: 'p1', name: 'Kobold VK7', category: 'Staubsauger', price: '1.299,00 €'},
  {id: 'p2', name: 'Kobold SP7 Saugwischer', category: 'Zubehör', price: null},
  {id: 'p3', name: 'Kobold VB100', category: 'Akkusauger', price: '899,00 €'},
]

const LANGER_NAME =
  'Kobold VK7 + SP7 Saugwischer + EB7 Elektrobürste + Polsterdüse Komplettset'

/** Testhülle: hält den Suchtext und filtert – genau wie die echten Seiten. */
function Huelle({
  produkte = PRODUKTE,
  onSelect = () => {},
  mitClear = true,
}: {
  produkte?: ProduktEintrag[]
  onSelect?: (e: ProduktEintrag) => void
  mitClear?: boolean
}) {
  const [wert, setWert] = useState('')
  const treffer = produkte.filter(p =>
    p.name.toLowerCase().includes(wert.trim().toLowerCase()),
  )
  return (
    <div>
      <ProductCombobox
        label="Produkt suchen"
        value={wert}
        options={treffer}
        onChange={setWert}
        onSelect={e => {
          setWert(e.name)
          onSelect(e)
        }}
        onClear={mitClear ? () => setWert('') : undefined}
      />
      <label>
        Menge
        <input type="number" defaultValue={1} />
      </label>
    </div>
  )
}

function liste() {
  return document.querySelector('[role="listbox"]') as HTMLElement | null
}

// Die Liste hängt im Portal am Body – ohne Aufräumen stünden nach dem
// zweiten Test zwei davon dort.
afterEach(cleanup)

beforeEach(() => {
  // jsdom liefert für getBoundingClientRect() sonst überall Nullen; damit
  // ließe sich nicht prüfen, dass oben/unten unterschieden wird.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 20, y: 100, top: 100, left: 20, right: 320, bottom: 148,
    width: 300, height: 48, toJSON: () => ({}),
  } as DOMRect)
  window.innerHeight = 800
  window.innerWidth = 400
})

describe('ProductCombobox – öffnen und schließen', () => {
  it('zeigt keine Liste, solange das Feld nicht benutzt wird', () => {
    render(<Huelle />)
    expect(liste()).toBeNull()
  })

  it('öffnet beim Fokussieren und zeigt alle Treffer', async () => {
    render(<Huelle />)
    await userEvent.click(screen.getByRole('combobox'))
    expect(within(liste()!).getAllByRole('option')).toHaveLength(3)
  })

  it('schließt nach der Auswahl sofort', async () => {
    render(<Huelle />)
    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.click(screen.getByText('Kobold VK7'))
    expect(liste()).toBeNull()
  })

  it('meldet das gewählte Produkt zurück', async () => {
    const gewaehlt = vi.fn()
    render(<Huelle onSelect={gewaehlt} />)
    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.click(screen.getByText('Kobold VB100'))
    expect(gewaehlt).toHaveBeenCalledWith(expect.objectContaining({id: 'p3'}))
  })

  it('öffnet nach einer Auswahl auf Klick wieder', async () => {
    // Nach dem Auswählen bleibt der Fokus im Feld – ein erneuter Klick löst
    // dann kein onFocus mehr aus. Ohne eigenen Klick-Griff wäre die Liste
    // danach nur noch über die Tastatur erreichbar.
    render(<Huelle />)
    const feld = screen.getByRole('combobox')
    await userEvent.click(feld)
    await userEvent.click(screen.getByText('Kobold VK7'))
    expect(liste()).toBeNull()

    await userEvent.click(feld)
    expect(liste()).not.toBeNull()
  })

  it('schließt mit Escape', async () => {
    render(<Huelle />)
    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.keyboard('{Escape}')
    expect(liste()).toBeNull()
  })

  it('schließt beim Klick außerhalb', async () => {
    render(<Huelle />)
    await userEvent.click(screen.getByRole('combobox'))
    expect(liste()).not.toBeNull()
    fireEvent.mouseDown(document.body)
    expect(liste()).toBeNull()
  })

  it('schließt auch dann, wenn ein Dialog mousedown aufhält', async () => {
    // Genau der Alltagsfall: Modal.tsx stoppt mousedown, damit ein Klick in
    // den Dialog ihn nicht schließt. Ein Zuhörer, der erst beim Blasen
    // greift, bekäme davon nie etwas mit.
    render(
      <div onMouseDown={e => e.stopPropagation()} data-testid="dialog">
        <Huelle />
        <h3>Kopfzeile</h3>
      </div>,
    )
    await userEvent.click(screen.getByRole('combobox'))
    expect(liste()).not.toBeNull()
    fireEvent.mouseDown(screen.getByText('Kopfzeile'))
    expect(liste()).toBeNull()
  })

  it('schließt mit Tab, damit der Fokus weiterwandern kann', async () => {
    render(<Huelle />)
    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.keyboard('{Tab}')
    expect(liste()).toBeNull()
  })
})

describe('ProductCombobox – Tastaturbedienung', () => {
  it('wandert mit den Pfeiltasten und wählt mit Enter', async () => {
    const gewaehlt = vi.fn()
    render(<Huelle onSelect={gewaehlt} />)
    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    expect(gewaehlt).toHaveBeenCalledWith(expect.objectContaining({id: 'p3'}))
  })

  it('läuft am Ende wieder nach vorn', async () => {
    const gewaehlt = vi.fn()
    render(<Huelle onSelect={gewaehlt} />)
    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.keyboard('{ArrowUp}{Enter}')
    expect(gewaehlt).toHaveBeenCalledWith(expect.objectContaining({id: 'p3'}))
  })

  it('springt mit Pos1 und Ende an den Rand', async () => {
    const gewaehlt = vi.fn()
    render(<Huelle onSelect={gewaehlt} />)
    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.keyboard('{End}{Enter}')
    expect(gewaehlt).toHaveBeenCalledWith(expect.objectContaining({id: 'p3'}))
  })

  it('benennt den markierten Eintrag für Vorlesehilfen', async () => {
    render(<Huelle />)
    const feld = screen.getByRole('combobox')
    await userEvent.click(feld)
    await userEvent.keyboard('{ArrowDown}')
    const aktiv = feld.getAttribute('aria-activedescendant')
    expect(aktiv).toBeTruthy()
    expect(document.getElementById(aktiv!)?.textContent).toContain('Kobold SP7')
  })

  it('schluckt Enter nicht, wenn nichts auszuwählen ist', async () => {
    // Sonst ließe sich das Formular mit der Eingabetaste nicht mehr
    // abschicken, sobald der Cursor im Suchfeld steht.
    render(<Huelle produkte={[]} />)
    const feld = screen.getByRole('combobox') as HTMLInputElement
    await userEvent.click(feld)
    const ereignis = createEnter()
    feld.dispatchEvent(ereignis)
    expect(ereignis.defaultPrevented).toBe(false)
  })
})

function createEnter() {
  return new KeyboardEvent('keydown', {key: 'Enter', bubbles: true, cancelable: true})
}

describe('ProductCombobox – Suche', () => {
  it('filtert beim Tippen weiter', async () => {
    render(<Huelle />)
    await userEvent.type(screen.getByRole('combobox'), 'SP7')
    expect(within(liste()!).getAllByRole('option')).toHaveLength(1)
    expect(screen.getByText('Kobold SP7 Saugwischer')).toBeTruthy()
  })

  it('sagt es, wenn nichts passt – statt leer zu bleiben', async () => {
    render(<Huelle />)
    await userEvent.type(screen.getByRole('combobox'), 'Rasenmäher')
    expect(within(liste()!).queryAllByRole('option')).toHaveLength(0)
    expect(screen.getByText('Kein Produkt gefunden.')).toBeTruthy()
  })

  it('setzt mit dem Löschknopf zurück', async () => {
    render(<Huelle />)
    const feld = screen.getByRole('combobox') as HTMLInputElement
    await userEvent.type(feld, 'VK7')
    await userEvent.click(screen.getByLabelText('Auswahl zurücksetzen'))
    expect(feld.value).toBe('')
  })
})

describe('ProductCombobox – Darstellung', () => {
  it('hängt die Liste an den Body, nicht ins Formular', async () => {
    // Der eigentliche Fehler von vorher: im Formular wurde sie von jedem
    // overflow:hidden abgeschnitten und schob die Felder darunter weg.
    const {container} = render(<Huelle />)
    await userEvent.click(screen.getByRole('combobox'))
    expect(container.querySelector('[role="listbox"]')).toBeNull()
    expect(document.body.querySelector('[role="listbox"]')).not.toBeNull()
  })

  it('begrenzt die Höhe und scrollt in sich selbst', async () => {
    const viele = Array.from({length: 60}, (_, i) => ({
      id: `x${i}`,
      name: `Produkt ${i}`,
      category: 'Test',
      price: null,
    }))
    render(<Huelle produkte={viele} />)
    await userEvent.click(screen.getByRole('combobox'))

    const box = liste()!
    expect(within(box).getAllByRole('option')).toHaveLength(60)
    // Begrenzte Höhe: die 60 Zeilen bleiben in der Liste, nicht auf der Seite.
    const hoehe = parseInt(box.style.maxHeight, 10)
    expect(hoehe).toBeGreaterThan(0)
    expect(hoehe).toBeLessThanOrEqual(340)
  })

  it('öffnet nach oben, wenn unten kein Platz mehr ist', async () => {
    window.innerHeight = 200 // Feld endet bei 148 – darunter ist nichts mehr
    render(<Huelle />)
    await userEvent.click(screen.getByRole('combobox'))

    const box = liste()!
    expect(box.style.bottom).not.toBe('')
    expect(box.style.top).toBe('')
  })

  it('öffnet nach unten, wenn dort Platz ist', async () => {
    render(<Huelle />)
    await userEvent.click(screen.getByRole('combobox'))

    const box = liste()!
    expect(box.style.top).not.toBe('')
    expect(box.style.bottom).toBe('')
  })

  it('bleibt schmaler als der sichtbare Bereich', async () => {
    window.innerWidth = 320
    render(<Huelle />)
    await userEvent.click(screen.getByRole('combobox'))

    const breite = parseInt(liste()!.style.width, 10)
    expect(breite).toBeLessThanOrEqual(320 - 16)
  })

  it('zeigt einen fehlenden Preis als Hinweis statt als Lücke', async () => {
    render(<Huelle />)
    await userEvent.click(screen.getByRole('combobox'))
    expect(screen.getByText('Preis nicht hinterlegt')).toBeTruthy()
  })

  it('zeigt vorhandene Preise unverändert an', async () => {
    render(<Huelle />)
    await userEvent.click(screen.getByRole('combobox'))
    expect(screen.getByText('1.299,00 €')).toBeTruthy()
  })

  it('stellt Kategorie und Name getrennt dar', async () => {
    render(<Huelle />)
    await userEvent.click(screen.getByRole('combobox'))

    const zeile = screen.getByText('Kobold VK7').closest('[role="option"]')!
    // Zwei eigene Elemente – kein zusammengesetzter Text, der ineinander
    // laufen könnte.
    expect(within(zeile as HTMLElement).getByText('Kobold VK7')).toBeTruthy()
    expect(within(zeile as HTMLElement).getByText('Staubsauger')).toBeTruthy()
  })

  it('trägt lange Produktnamen, ohne sie zu verlieren', async () => {
    render(<Huelle produkte={[{id: 'l1', name: LANGER_NAME, category: 'Set', price: null}]} />)
    await userEvent.click(screen.getByRole('combobox'))
    // Der volle Name steht im Dokument; das Kürzen auf zwei Zeilen macht CSS.
    expect(screen.getByText(LANGER_NAME)).toBeTruthy()
  })

  it('kommt mit genau einem Produkt aus', async () => {
    render(<Huelle produkte={[PRODUKTE[0]]} />)
    await userEvent.click(screen.getByRole('combobox'))
    expect(within(liste()!).getAllByRole('option')).toHaveLength(1)
  })

  it('lässt die Felder darunter erreichbar', async () => {
    render(<Huelle />)
    await userEvent.click(screen.getByRole('combobox'))
    // Die Mengenangabe steht weiterhin im Formular und ist bedienbar – sie
    // wurde nicht von der Liste verdrängt.
    const menge = screen.getByLabelText('Menge')
    await userEvent.clear(menge)
    await userEvent.type(menge, '3')
    expect((menge as HTMLInputElement).value).toBe('3')
  })
})
