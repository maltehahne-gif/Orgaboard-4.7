import {expect, test} from '@playwright/test'
import {E2E_USERS} from '../playwright.config'

async function login(page: import('@playwright/test').Page, user = E2E_USERS.employee) {
  await page.goto('/login')
  await page.getByLabel('E-Mail').fill(user.email)
  await page.getByLabel('Passwort', {exact: true}).fill(user.password)
  await page.getByRole('button', {name: 'Anmelden'}).click()
  await expect(page.getByRole('heading', {name: 'Dashboard'})).toBeVisible()
}

async function logout(page: import('@playwright/test').Page) {
  await page.context().clearCookies()
  await page.goto('/login')
  await expect(page.getByRole('button', {name: 'Anmelden'})).toBeVisible()
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

    await expect(page.getByText('Dein Feedback wurde gesendet. Vielen Dank.')).toBeVisible()
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
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({detail: 'Feedback konnte nicht gesendet werden. Bitte versuche es erneut.'}),
      }),
    )

    await page.getByLabel('Betreff').fill('E2E: simulierter Serverfehler')
    await page.getByLabel('Nachricht', {exact: true}).fill('Dieser Vorgang wird über eine simulierte 500-Antwort abgefangen.')
    const senden = page.getByRole('button', {name: 'Feedback senden'})
    await senden.click()

    await expect(page.getByRole('alert')).toContainText('Feedback konnte nicht gesendet werden')
    await expect(page.getByText(/Dein Feedback wurde gesendet/)).toHaveCount(0)
    await expect(senden).toBeEnabled()
  })

  test('ein FastAPI-Validierungsfehler wird lesbar - niemals [object Object]', async ({page}) => {
    await login(page)
    await page.goto('/feedback')

    // Genau die Form, die FastAPI bei einem 422 liefert.
    await page.route('**/api/v1/feedback', route =>
      route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({
          detail: [{type: 'missing', loc: ['body', 'subject'], msg: 'Field required'}],
        }),
      }),
    )

    await page.getByLabel('Betreff').fill('E2E: Validierungsfehler')
    await page.getByLabel('Nachricht', {exact: true}).fill('Der 422 muss als lesbarer Satz im Formular ankommen.')
    await page.getByRole('button', {name: 'Feedback senden'}).click()

    await expect(page.getByRole('alert')).toContainText('subject: Field required')
    await expect(page.locator('body')).not.toContainText('[object Object]')
  })

  /**
   * Feedback per Formular abschicken. Bewusst mit wechselnden Absendern in
   * den folgenden Tests: serverseitig sind fünf Einsendungen je zehn
   * Minuten und Benutzer erlaubt, und die sechste würde mit 429 abgelehnt -
   * der Test wäre dann rot, ohne dass etwas kaputt ist.
   */
  async function feedbackSenden(
    page: import('@playwright/test').Page,
    betreff: string,
    kategorie = 'bug',
  ) {
    await page.goto('/feedback')
    await page.getByLabel('Kategorie').selectOption(kategorie)
    await page.getByLabel('Betreff').fill(betreff)
    await page.getByLabel('Nachricht', {exact: true}).fill(
      'Diese Rückmeldung darf ausschließlich bei der Systemadministration ankommen.',
    )
    await page.getByRole('button', {name: 'Feedback senden'}).click()
    await expect(page.getByText('Dein Feedback wurde gesendet. Vielen Dank.')).toBeVisible()
  }

  /** Alle Nachrichten, die dieses Konto überhaupt abrufen darf. */
  async function nachrichtenText(page: import('@playwright/test').Page) {
    const antwort = await page.request.get('/api/v1/messages')
    expect(antwort.ok()).toBe(true)
    return JSON.stringify(await antwort.json())
  }

  test('der Systemadministrator bekommt das Feedback als private Nachricht', async ({page}) => {
    const betreff = `E2E Vertraulich ${Date.now()}`

    await login(page, E2E_USERS.employee)
    await feedbackSenden(page, betreff, 'improvement')

    // Die Absenderin selbst behält keine sichtbare Kopie: für Mitarbeiter
    // existiert das Konto eines Systemadministrators nicht
    // (backend/app/core/benutzerscope.py). Eine Nachricht "an Ida X" wäre
    // genau die Auskunft, die dort bewusst zurückgehalten wird.
    expect(await nachrichtenText(page)).not.toContain(betreff)

    await logout(page)
    await login(page, E2E_USERS.systemAdmin)

    // Erst über die API - unabhängig davon, welche Unterhaltung die
    // Oberfläche gerade offen hat.
    expect(await nachrichtenText(page)).toContain(betreff)

    // Und dann so, wie der Systemadministrator es tatsächlich sieht: als
    // ungelesene private Nachricht in der Unterhaltung mit der Absenderin.
    await page.goto('/nachrichten')
    await page.getByRole('button', {name: /Björn Hahne/}).click()
    await expect(page.getByText(betreff).first()).toBeVisible()
    await expect(page.getByText('Verbesserung').first()).toBeVisible()
  })

  test.describe('Feedback bleibt vertraulich', () => {
    for (const [bezeichnung, absender, mitleser] of [
      ['Teamleiter', E2E_USERS.otherEmployee, E2E_USERS.teamLeader],
      ['anderer Mitarbeiter', E2E_USERS.thirdEmployee, E2E_USERS.employee],
    ] as const) {
      test(`${bezeichnung} sieht fremdes Feedback nicht`, async ({page}) => {
        const betreff = `E2E Geheim ${bezeichnung} ${Date.now()}`

        await login(page, absender)
        await feedbackSenden(page, betreff)

        await logout(page)
        await login(page, mitleser)

        // Weder in irgendeiner Unterhaltung ...
        expect(await nachrichtenText(page)).not.toContain(betreff)

        // ... noch als ungelesene Nachricht ...
        const ungelesen = await page.request.get('/api/v1/messages/unread')
        expect((await ungelesen.json()).total).toBe(0)

        // ... noch über die globale Suche.
        const suche = await page.request.get(`/api/v1/search?q=${encodeURIComponent('E2E Geheim')}`)
        expect(JSON.stringify(await suche.json())).not.toContain(betreff)
      })
    }
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

    await expect(page.getByText(/Dein Feedback wurde gesendet\. Vielen Dank\./)).toBeVisible()
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
      await expect(page.getByText(/Dein Feedback wurde gesendet\. Vielen Dank\./)).toBeVisible()
    })
  })
})
