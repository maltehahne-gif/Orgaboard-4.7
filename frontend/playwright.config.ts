import {defineConfig, devices} from '@playwright/test'

/**
 * Kleine, wartbare E2E-Suite für die wichtigsten Abläufe (Login, Feedback).
 *
 * Startet drei kurzlebige Prozesse für die Dauer des Testlaufs:
 *   1. Ein lokaler SMTP-Auffänger (app/tools/fake_smtp.py) - fängt jede
 *      Mail ab, verschickt nichts wirklich. Automatisierte Tests dürfen
 *      keine echte E-Mail an orgaboard@gmail.com auslösen.
 *   2. Das Backend gegen eine frische SQLite-Datei mit den Standard-
 *      Testbenutzern aus app/seed.py.
 *   3. Der Vite-Dev-Server, der /api und /ws bereits zum Backend
 *      durchreicht (siehe vite.config.ts).
 *
 * Voraussetzung: Backend-Abhängigkeiten sind installiert (siehe
 * backend/requirements.txt) und "python"/"alembic" liegen im PATH - genau
 * dieselbe Annahme wie beim bestehenden Makefile-Ziel "backend-test".
 */

const E2E_DB = 'e2e-playwright.db'
const E2E_JWT_SECRET = 'e2e-nur-lokal-nicht-fuer-produktion-verwenden-lange-genug'
const E2E_SEED_PASSWORD = 'OrgaBoard-E2E-2026!'
const E2E_FEEDBACK_TO = 'e2e-feedback-sink@example.com'

const backendEnv = {
  ENV: 'development',
  DATABASE_URL: `sqlite:///./${E2E_DB}`,
  JWT_SECRET: E2E_JWT_SECRET,
  COOKIE_SECURE: 'false',
  FRONTEND_ORIGIN: 'http://localhost:5173',
  AUTO_CREATE_SCHEMA: 'false',
  SEED_DEFAULT_PASSWORD: E2E_SEED_PASSWORD,
  AI_ENABLED: 'false',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
  SMTP_FROM_EMAIL: 'orgaboard-e2e@example.com',
  SMTP_USE_TLS: 'false',
  FEEDBACK_EMAIL_TO: E2E_FEEDBACK_TO,
}

export const E2E_USERS = {
  employee: {email: 'bjoern.hahne@example.com', password: E2E_SEED_PASSWORD},
  teamLeader: {email: 'carsten.boehrensen@example.com', password: E2E_SEED_PASSWORD},
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Nur gesetzt, wenn eine vorinstallierte Browser-Version verwendet
        // werden soll, die nicht exakt zur @playwright/test-Version passt
        // (z. B. in dieser Sandbox) - ansonsten managt Playwright den
        // Browser wie gewohnt selbst.
        ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
          ? {launchOptions: {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}}
          : {}),
      },
    },
  ],
  webServer: [
    {
      command: 'python -m app.tools.fake_smtp 1025',
      cwd: '../backend',
      port: 1025,
      reuseExistingServer: !process.env.CI,
      timeout: 20_000,
    },
    {
      command:
        `rm -f ${E2E_DB} && alembic upgrade head && python -m app.seed && ` +
        'uvicorn app.main:app --host 0.0.0.0 --port 8000',
      cwd: '../backend',
      env: backendEnv,
      url: 'http://localhost:8000/health',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'npm run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
})
