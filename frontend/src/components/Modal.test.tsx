import {cleanup, fireEvent, render, screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {useState} from 'react'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {Modal} from './Modal'

afterEach(cleanup)

function Auslöser({schließt}: {schließt?: () => void}) {
  const onClose = schließt ?? vi.fn()
  return (
    <div>
      <button type="button">Öffnen (Auslöser)</button>
      <Modal title="Testdialog" onClose={onClose}>
        <button type="button">Erster Knopf</button>
        <button type="button">Letzter Knopf</button>
      </Modal>
    </div>
  )
}

describe('Modal – Zugänglichkeit', () => {
  it('trägt role="dialog", aria-modal und einen mit dem Titel verknüpften aria-labelledby', () => {
    render(<Modal title="Verkauf erfassen" onClose={vi.fn()}><p>Inhalt</p></Modal>)

    const dialog = screen.getByRole('dialog', {name: 'Verkauf erfassen'})
    expect(dialog.getAttribute('aria-modal')).toBe('true')
  })

  it('gibt der Schließen-Schaltfläche ein aria-label', () => {
    render(<Modal title="Testdialog" onClose={vi.fn()}><p>Inhalt</p></Modal>)
    expect(screen.getByRole('button', {name: 'Schließen'})).toBeTruthy()
  })

  it('setzt den Fokus beim Öffnen auf den Dialog selbst', () => {
    render(
      <Modal title="Testdialog" onClose={vi.fn()}>
        <button type="button">Erster Knopf</button>
      </Modal>,
    )
    // Nicht auf das erste fokussierbare Kind (das wäre die
    // Schließen-Schaltfläche, ein irreführender erster Stopp) - auf den
    // Dialog selbst.
    expect(document.activeElement).toBe(screen.getByRole('dialog'))
  })

  it('schließt mit Escape', async () => {
    const onClose = vi.fn()
    render(<Modal title="Testdialog" onClose={onClose}><p>Inhalt</p></Modal>)

    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('schließt bei einem Klick auf den Hintergrund', () => {
    const onClose = vi.fn()
    const {container} = render(<Modal title="Testdialog" onClose={onClose}><p>Inhalt</p></Modal>)
    fireEvent.mouseDown(container.querySelector('.modal-backdrop')!)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('schließt nicht bei einem Klick innerhalb des Dialogs', () => {
    const onClose = vi.fn()
    render(<Modal title="Testdialog" onClose={onClose}><p>Inhalt</p></Modal>)
    fireEvent.mouseDown(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('springt von letzten zum ersten fokussierbaren Element (Fokus-Falle vorwärts)', () => {
    render(
      <Modal title="Testdialog" onClose={vi.fn()}>
        <button type="button">Erster Knopf</button>
        <button type="button">Letzter Knopf</button>
      </Modal>,
    )

    // Reihenfolge im Markup: Schließen-Schaltfläche, dann der Inhalt -
    // "Letzter Knopf" ist hier das letzte fokussierbare Element.
    const letzterKnopf = screen.getByRole('button', {name: 'Letzter Knopf'})
    letzterKnopf.focus()
    expect(document.activeElement).toBe(letzterKnopf)

    fireEvent.keyDown(letzterKnopf, {key: 'Tab', code: 'Tab'})
    expect(document.activeElement).toBe(screen.getByRole('button', {name: 'Schließen'}))
  })

  it('springt vom ersten zum letzten fokussierbaren Element zurück (Fokus-Falle rückwärts)', () => {
    render(
      <Modal title="Testdialog" onClose={vi.fn()}>
        <button type="button">Erster Knopf</button>
        <button type="button">Letzter Knopf</button>
      </Modal>,
    )

    const schließenKnopf = screen.getByRole('button', {name: 'Schließen'})
    schließenKnopf.focus()
    expect(document.activeElement).toBe(schließenKnopf)

    fireEvent.keyDown(schließenKnopf, {key: 'Tab', code: 'Tab', shiftKey: true})
    expect(document.activeElement).toBe(screen.getByRole('button', {name: 'Letzter Knopf'}))
  })

  it('gibt den Fokus beim Schließen an das auslösende Element zurück', async () => {
    function Wrapper() {
      const [open, setOpen] = useState(false)
      return (
        <div>
          <button type="button" onClick={() => setOpen(true)}>
            Öffnen
          </button>
          {open && (
            <Modal title="Testdialog" onClose={() => setOpen(false)}>
              <button type="button">Inhalt</button>
            </Modal>
          )}
        </div>
      )
    }

    render(<Wrapper />)
    await userEvent.click(screen.getByRole('button', {name: 'Öffnen'}))
    expect(screen.getByRole('dialog')).toBeTruthy()

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', {name: 'Öffnen'}))
  })

  describe('closeDisabled – kein unbeabsichtigtes Schließen während eines kritischen Speichervorgangs', () => {
    it('ignoriert Escape', async () => {
      const onClose = vi.fn()
      render(
        <Modal title="Testdialog" onClose={onClose} closeDisabled>
          <p>Inhalt</p>
        </Modal>,
      )
      await userEvent.keyboard('{Escape}')
      expect(onClose).not.toHaveBeenCalled()
    })

    it('ignoriert einen Klick auf den Hintergrund', () => {
      const onClose = vi.fn()
      const {container} = render(
        <Modal title="Testdialog" onClose={onClose} closeDisabled>
          <p>Inhalt</p>
        </Modal>,
      )
      fireEvent.mouseDown(container.querySelector('.modal-backdrop')!)
      expect(onClose).not.toHaveBeenCalled()
    })

    it('deaktiviert die Schließen-Schaltfläche', () => {
      render(
        <Modal title="Testdialog" onClose={vi.fn()} closeDisabled>
          <p>Inhalt</p>
        </Modal>,
      )
      expect(screen.getByRole('button', {name: 'Schließen'}).hasAttribute('disabled')).toBe(true)
    })
  })
})
