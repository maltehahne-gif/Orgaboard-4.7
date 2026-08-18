import {expect, test} from '@playwright/test'
import {E2E_USERS} from '../playwright.config'

test.describe('Login', () => {
  test('erfolgreicher Login führt zum Dashboard', async ({page}) => {
    await page.goto('/login')
    await page.getByLabel('E-Mail').fill(E2E_USERS.employee.email)
    await page.getByLabel('Passwort', {exact: true}).fill(E2E_USERS.employee.password)
    await page.getByRole('button', {name: 'Anmelden'}).click()

    await expect(page.getByRole('heading', {name: 'Dashboard'})).toBeVisible()
    await expect(page).toHaveURL('/')
  })

  test('falsches Passwort zeigt eine Fehlermeldung und bleibt auf der Login-Seite', async ({page}) => {
    await page.goto('/login')
    await page.getByLabel('E-Mail').fill(E2E_USERS.employee.email)
    await page.getByLabel('Passwort', {exact: true}).fill('ganz-falsches-passwort')
    await page.getByRole('button', {name: 'Anmelden'}).click()

    await expect(page.getByRole('alert')).toContainText(/falsch/)
    await expect(page).toHaveURL(/\/login/)
  })

  test('Logout führt zurück zur Login-Seite', async ({page}) => {
    await page.goto('/login')
    await page.getByLabel('E-Mail').fill(E2E_USERS.employee.email)
    await page.getByLabel('Passwort', {exact: true}).fill(E2E_USERS.employee.password)
    await page.getByRole('button', {name: 'Anmelden'}).click()
    await expect(page.getByRole('heading', {name: 'Dashboard'})).toBeVisible()

    await page.getByRole('button', {name: 'Profilmenü'}).click()
    await page.getByRole('button', {name: 'Abmelden'}).click()

    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByRole('button', {name: 'Anmelden'})).toBeVisible()
  })

  test('eine abgelaufene Sitzung führt ohne Endlosschleife zurück zum Login', async ({page, context}) => {
    await page.goto('/login')
    await page.getByLabel('E-Mail').fill(E2E_USERS.employee.email)
    await page.getByLabel('Passwort', {exact: true}).fill(E2E_USERS.employee.password)
    await page.getByRole('button', {name: 'Anmelden'}).click()
    await expect(page.getByRole('heading', {name: 'Dashboard'})).toBeVisible()

    // Sitzungscookie entfernen simuliert eine abgelaufene Sitzung, ohne auf
    // die tatsächliche Ablaufzeit warten zu müssen.
    await context.clearCookies()

    await page.goto('/verkaeufe')
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByRole('button', {name: 'Anmelden'})).toBeVisible()
  })
})
