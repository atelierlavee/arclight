# Security

Arc Light holds a private library and the viewing history of everyone who
uses it. Security reports are taken seriously.

## Reporting a vulnerability

**Please don't open a public issue.** Report it privately through GitHub:

1. Go to the repository's **Security** tab.
2. Choose **Report a vulnerability**.
3. Describe the problem, how to reproduce it, and what an attacker could do.

You'll get a reply as soon as possible. Please give us a chance to fix the
problem before you share details publicly.

Don't include real media, real filenames or screenshots from a real library in
your report.

## What's supported

Only the latest version on `main` gets security fixes.

## The security model

This explains what Arc Light protects against, so you can tell whether
something is a vulnerability.

### Protected

- **Every API route needs a signed-in session** apart from a short public list
  (sign-in, setup, health check). The list is fixed in `auth/guard.ts`, and a
  test fails if a route is added to it without review.
- **Cross-site requests.** Requests that change data (POST, PUT, PATCH,
  DELETE) are refused if they come from an origin the app doesn't trust, on
  top of the SameSite session cookie.
- **Profiles are separate.** One profile can't read or change another's
  history, ratings, bookmarks or vault. Only the owner profile can manage
  folders, scans, backups and settings.
- **Vault items don't leak.** A hidden video doesn't appear in any list,
  search, count or stat, and requests for it by id return 404, until the vault
  is unlocked. `api/hiddenLeaks.test.ts` checks this.
- **Cast links are narrow.** A link given to a TV is signed, works for only one
  video, and expires after six hours.
- **The media library is mounted read-only.** The app can't change or delete
  your videos.

### Not protected (by design)

- **Discreet mode is a visual screen, not encryption.** It blurs images against
  someone glancing over your shoulder. It doesn't protect against someone who
  can use your computer or read the database.
- **The local network switch is a convenience, not a security boundary.** It
  decides from the address in the request whether the app answers other
  devices, and that address can be faked. The password is what keeps people
  out.
- **Arc Light isn't built to face the internet.** It's meant for your own
  machine and your home network. Exposing it publicly (port forwarding, a
  public reverse proxy) is outside what it's designed for. If you need remote
  access, use a VPN.
- **Database and backups aren't encrypted at rest.** Protect the machine and
  the backup folder the way you'd protect the library itself.

## Secrets

API keys (`STASHDB_API_KEY`, `TPDB_API_KEY`) live in `docker/.env`, which is
git-ignored and isn't included in backups. Never commit it.
