import {expect, test} from '@playwright/test'
import {E2E_USERS} from '../playwright.config'

async function login(page: import('@playwright/test').Page, user = E2E_USERS.employee) {
  await page.goto('/login')
  await page.getByLabel('E-Mail').fill(user.email)
  await page.getByLabel('Passwort', {exact: true}).fill(user.password)
  await page.getByRole('button', {name: 'Anmelden'}).click()
  await expect(page.getByRole('heading', {name: 'Dashboard'})).toBeVisible()
}

test.describe('Feedback (TEST 11)', () => {
  test('vollständiger Ablauf: einloggen, Feedback öffnen, ausfüllen, senden', async ({page}) => {
    await login(page)

    await page.locator('.ob-sidebar').getByRole('link', {name: 'Feedback'}).click()
    await expect(page).toHaveURL(/\/feedback/)
    await expect(page.getByRole('heading', {name: 'Feedback'})).toBeVisible()

    await page.getByLabel('Kategorie').selectOption('bug')
    await page.getByLabel('Betreff').fill('E2E: Verkauf lässt sich nicht speichern')
    await page.getByLabel('Nachricht', {exact: true}).fill(
      'Beim Klick auf Speichern passiert nichts. Erwartet: Bestätigung. Reproduzierbar mit jedem Verkauf.',
    )

    const senden = page.getByRole('button', {name: 'Feedback senden'})
    // Das Deaktivieren während der Anfrage ist mit der schnellen lokalen
    // Testumgebung zeitlich nicht zuverlässig zu erwischen (Antwort kommt
    // oft, bevor die Prüfung überhaupt greift) - exakt geprüft wird das
    // stattdessen in FeedbackPage.test.tsx mit einer kontrolliert
    // hängenden Anfrage. Hier zählt der Doppelklick selbst: er darf keine
    // zweite Einsendung mit eigener Referenz erzeugen.
    await senden.click()
    await senden.click()

    await expect(page.getByText('Vielen Dank! Dein Feedback wurde erfolgreich übermittelt.')).toBeVisible()
    await expect(page.getByText(/Referenz: FDB-\d{4}-\d{6}/)).toBeVisible()

    // Formular danach sauber zurückgesetzt.
    await expect(page.getByLabel('Betreff')).toHaveValue('')
    await expect(page.getByLabel('Nachricht', {exact: true})).toHaveValue('')
    await expect(senden).toBeEnabled()
  })

  test('zeigt einen Backend-Fehler ohne falschen Erfolg und lässt einen erneuten Versuch zu', async ({page}) => {
    await login(page)
    await page.goto('/feedback')

    await page.route('**/api/v1/feedback', route =>
      route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({detail: 'Dein Feedback wurde gespeichert, aber der Versand ist fehlgeschlagen. Bitte versuche es erneut.'}),
      }),
    )

    await page.getByLabel('Betreff').fill('E2E: simulierter Mailfehler')
    await page.getByLabel('Nachricht', {exact: true}).fill('Dieser Versand wird über eine simulierte 502-Antwort abgefangen.')
    const senden = page.getByRole('button', {name: 'Feedback senden'})
    await senden.click()

    await expect(page.getByRole('alert')).toContainText('Versand ist fehlgeschlagen')
    await expect(page.getByText(/erfolgreich übermittelt/)).toHaveCount(0)
    await expect(senden).toBeEnabled()
  })

  test('zeigt die 429-Meldung, wenn das Rate-Limit erreicht ist', async ({page}) => {
    // Eigene Benutzerin, damit Einsendungen aus den anderen Tests dieser
    // Datei das Kontingent (5 je 10 Minuten) nicht schon vorbelastet haben.
    await login(page, E2E_USERS.teamLeader)
    await page.goto('/feedback')

    // Serverseitig 5 Einsendungen je 10 Minuten - die sechste muss die
    // Ratenbegrenzung auslösen (echter Aufruf, kein simulierter).
    for (let i = 0; i < 5; i += 1) {
      await page.getByLabel('Betreff').fill(`E2E Rate-Limit ${i}`)
      await page.getByLabel('Nachricht', {exact: true}).fill('Nachricht zum Austesten des Rate-Limits im E2E-Test.')
      await page.getByRole('button', {name: 'Feedback senden'}).click()
      await expect(page.getByText(/erfolgreich übermittelt/)).toBeVisible()
    }

    await page.getByLabel('Betreff').fill('E2E Rate-Limit 6')
    await page.getByLabel('Nachricht', {exact: true}).fill('Diese sechste Einsendung soll abgelehnt werden.')
    await page.getByRole('button', {name: 'Feedback senden'}).click()

    await expect(page.getByRole('alert')).toContainText(/kurzer Zeit mehrere Feedbacks/)
  })

  test('ist vollständig über die Tastatur bedienbar', async ({page}) => {
    await login(page)
    await page.goto('/feedback')

    await page.getByLabel('Kategorie').focus()
    await page.keyboard.press('Tab')
    await expect(page.getByLabel('Betreff')).toBeFocused()
    await page.keyboard.type('E2E: Tastaturtest')

    await page.keyboard.press('Tab')
    await expect(page.getByLabel('Nachricht', {exact: true})).toBeFocused()
    await page.keyboard.type('Vollständig über die Tastatur ausgefüllt und mit Enter abgesendet.')

    await page.keyboard.press('Tab') // Aktuelle Seite
    await page.keyboard.press('Tab') // Feedback senden
    await expect(page.getByRole('button', {name: 'Feedback senden'})).toBeFocused()
    await page.keyboard.press('Enter')

    await expect(page.getByText(/erfolgreich übermittelt/)).toBeVisible()
  })

  test.describe('Mobile Viewport', () => {
    test.use({viewport: {width: 390, height: 844}})

    test('Feedback ist über die mobile Navigation erreichbar und ohne horizontales Scrollen bedienbar', async ({page}) => {
      await login(page)

      await page.getByRole('button', {name: 'Weitere Bereiche'}).click()
      await page.locator('.ob-drawer').getByRole('link', {name: 'Feedback'}).click()

      await expect(page).toHaveURL(/\/feedback/)
      await expect(page.getByRole('heading', {name: 'Feedback'})).toBeVisible()

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      )
      expect(overflow).toBe(false)

      await page.getByLabel('Betreff').fill('E2E: Mobilansicht')
      await page.getByLabel('Nachricht', {exact: true}).fill('Getestet auf einem 390px breiten Viewport ohne horizontales Scrollen.')
      await page.getByRole('button', {name: 'Feedback senden'}).click()
      await expect(page.getByText(/erfolgreich übermittelt/)).toBeVisible()
    })
  })
})
