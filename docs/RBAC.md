# Rollen und Berechtigungen

## Die vier Stufen

Die Rangfolge steht in `Role` (`backend/app/models.py`) und wird
organisatorisch so gelesen:

| Rolle | Wert | Rang | Aufgabe |
|---|---|---|---|
| Mitarbeiter | `EMPLOYEE` | 0 | keine Verwaltungsrechte |
| Teamleiter | `TEAM_LEADER` | 10 | führt die Mitarbeiter der eigenen Teams |
| Organisationsleitung | `REGIONAL_LEAD` | 20 | setzt Teamleiter ein und ab |
| Systemadministrator | `SYSTEM_ADMIN` | 100 | Betreiber der Anlage |

Der Systemadministrator ist **keine Führungskraft über dem Teamleiter**,
sondern eine technische Sonderrolle außerhalb der Linie. Für alles unterhalb
existiert sein Konto nicht – siehe unten.

Geprüft wird nirgends auf Gleichheit, sondern über den Rang. Eine neue Rolle
muss dadurch nicht in jeder einzelnen Abfrage nachgetragen werden.

## Fachliche Rechte

| Bereich | Mitarbeiter | Teamleiter | Organisationsleitung | Systemadmin |
|---|---|---|---|---|
| Eigene Termine/Kunden/Verkäufe | Lesen/Schreiben | Lesen/Schreiben | Lesen/Schreiben | Lesen/Schreiben |
| Fremde Mitarbeiterdaten | Nein | Ja | Ja | Ja |
| Teamstatistiken | Nein | Ja | Ja | Ja |
| Produkte lesen | verifizierte Datensätze | verifizierte + unverifizierte zur Prüfung | dito | dito |
| Produktquellen importieren | Nein | Ja | Ja | Ja |
| Eigene Buntewoche | Ja | Ja | Ja | Ja |
| Buntewoche anderer | Nein | Ja | Ja | Ja |
| Nachrichten | eigene + Teamchat | eigene + Teamchat | dito | dito |
| Audit-Log | Nein | Ja | Ja | Ja |
| KI auf eigene Daten | Ja | Ja | Ja | Ja |
| KI auf fremde Daten | Nein | Ja | Ja | Ja |

## Benutzerverwaltung

| Aktion | Mitarbeiter | Teamleiter | Organisationsleitung | Systemadmin |
|---|---|---|---|---|
| Benutzerliste sehen | Nein | eigener Bereich | alles unterhalb | alle |
| Mitarbeiter anlegen | Nein | Ja | Ja | Ja |
| Mitarbeiter ins eigene Team holen | Nein | Ja | Ja | Ja |
| Teamleiter ernennen/absetzen | Nein | **Nein** | Ja | Ja |
| Organisationsleitung ernennen | Nein | Nein | Nein | Ja |
| Konto deaktivieren | Nein | eigener Bereich | alles unterhalb | alle |
| Konto **endgültig löschen** | Nein | **Nein** | **Nein** | Ja |

### Wer welche Rolle vergeben darf

Eine Regel statt einer Aufzählung (`erlaubte_zielrollen()` in
`backend/app/core/benutzerscope.py`): **niemand vergibt die eigene Stufe.**
Zulässig ist nur, was strikt darunter liegt.

Daraus folgt ohne weiteres Zutun:

- Ein Teamleiter kommt auf genau eine vergebbare Rolle: Mitarbeiter. Er kann
  also keinen zweiten Teamleiter erzeugen und seine Führungsbefugnis nicht
  weiterreichen.
- Hochstufen kann sich niemand – die eigene Rolle liegt nie unter der
  eigenen Stufe.
- Teamleiter einzusetzen ist Sache der Organisationsleitung.

Der Systemadministrator ist die Ausnahme nach oben: er darf einen zweiten
Betreiber einsetzen, sonst hinge die Anlage an einem einzigen Konto.

### Wen ein Teamleiter verwalten darf

Die Rolle allein reicht nicht – zusätzlich zählt die Teamzugehörigkeit
(`verwaltbar()`). Ein Teamleiter verwaltet:

- Mitarbeiter der Teams, deren Leitung bei ihm liegt (`Team.lead_user_id`),
- Mitarbeiter ohne Team (die darf er aufnehmen),
- sich selbst (ohne eigene Rolle ändern oder sich abschalten zu können).

Nicht dagegen: fremde Teams, andere Teamleiter, die Organisationsleitung,
den Systemadministrator.

### Team besetzen ≠ Rolle vergeben

Bewusst zwei Paare getrennter Einzelrechte, damit aus „Mitarbeiter
verwalten“ nie „Rollen vergeben“ folgt:

| Recht | Mitarbeiter | Teamleiter | Organisationsleitung |
|---|---|---|---|
| `team.member.add` | – | ✔ | ✔ |
| `team.member.remove` | – | ✔ | ✔ |
| `role.teamleader.assign` | – | – | ✔ |
| `role.teamleader.revoke` | – | – | ✔ |

Die Rollenrechte reichen für sich allein nicht: zusätzlich gilt immer die
Rangregel oben. Ein versehentlich gesetzter Haken kann die absolute Regel
„ein Teamleiter macht keinen zweiten Teamleiter“ deshalb nicht aushebeln.

Endgültiges Löschen ist gar kein Einzelrecht, sondern fest an den
Systemadministrator gebunden (`pruefe_loeschrecht()`) – was sich zuteilen
lässt, lässt sich auch versehentlich zuteilen, und Löschen ist die einzige
Aktion ohne Rückweg.

## Der Systemadministrator ist unsichtbar

Für alles unterhalb des Systemadministrators existiert sein Konto nicht.
Nicht „ohne Schaltfläche“, sondern ohne Datensatz in der Antwort. Erkannt
wird er über die Rolle, nie über Name oder E-Mail.

Gefiltert wird in: Benutzerliste (`/admin/users`), Mitarbeiterliste
(`/team/employees`), Empfängerauswahl (`/directory/users`), Namenssuche,
Mitarbeitervergleich, Teamübersicht, Cockpit-Hinweisen, Wochen-/Monatsbericht,
Audit-Log und der Empfängersuche des KI-Assistenten.

Der Einzelabruf über die ID antwortet mit **404, nicht 403** – ein 403 wäre
die Bestätigung, dass es das Konto gibt. Eine Nachricht an dieses Konto wird
ebenso mit 404 abgewiesen.

## Konto deaktivieren vs. endgültig löschen

Zwei getrennte Vorgänge (`backend/app/services/kontoloeschung.py`):

**Deaktivieren** (`PUT /sysadmin/users/{id}` mit `is_active: false`) setzt
ein Kennzeichen. Das Konto bleibt vollständig erhalten, die Anmeldung ist
gesperrt, jede Zuordnung bleibt, Reaktivieren stellt den alten Zustand her.

**Endgültig löschen** (`DELETE /sysadmin/users/{id}`) entfernt den
Benutzerdatensatz wirklich – mit Passwort-Hash, E-Mail, Telefonnummer,
Avatar, Einzelrechten, Push-Anmeldungen, Benachrichtigungen und
KI-Verläufen. Eine noch offene Sitzung ist mit der nächsten Anfrage
ungültig, weil `get_current_user()` das Konto bei jeder Anfrage frisch
nachschlägt.

Die Unternehmenshistorie bleibt: Kunden, Termine, Verkäufe, Angebote,
Verleihe, Altgeräte und Wochenstatistiken hängen am Mitarbeiterprofil, nicht
am Konto. Trägt das Profil solche Daten, bleibt es als namenloser, vom Konto
gelöster Rest stehen (`employees.user_id` ist dafür nullable); trägt es
keine, fällt es mit dem Konto. Führungszuordnungen in Region/Bezirk/Team und
der Stornovermerk an Verkäufen werden entkoppelt, nicht gelöscht.
Protokolleinträge bleiben lesbar – nur der Verweis auf das Konto fällt weg;
wer gelöscht hat, steht im Eintrag `sysadmin.user_deleted`.

Gesperrt sind: das eigene Konto und der letzte aktive Systemadministrator –
weder durch Löschen noch durch Herabstufen oder Abschalten.

## Serverseitige Durchsetzung

`scoped_employee_id()` überschreibt bzw. validiert den Mitarbeiter-Scope.
Mitarbeiter können durch manipulierte Request-Parameter keine fremden
`employee_id`-Werte lesen. Teamleiter dürfen einen Scope explizit auswählen
oder aggregiert arbeiten.

Sichtbarkeit, Zuständigkeit und Rollenvergabe beantwortet
`backend/app/core/benutzerscope.py` an einer Stelle. Die Oberfläche blendet
nur aus, was der Server ohnehin ablehnt – eine versteckte Schaltfläche ist
kein Schutz. Geprüft wird das in `backend/tests/test_rollenhierarchie.py`
und `backend/tests/test_kontoloeschung.py` über HTTP, nicht über die
Hilfsfunktionen: eine Prüfung, die nur in der Bibliothek richtig ist und im
Endpunkt nicht aufgerufen wird, ist keine.
