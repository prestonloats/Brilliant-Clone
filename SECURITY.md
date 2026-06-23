# Security Policy

Balance is a local-first, browser-only MVP for a Brilliant-style algebra path.
This policy explains how to report a vulnerability and describes the project's
current security model so reporters can focus on issues that are genuinely
in scope.

## Supported Versions

Balance is pre-1.0 and ships from the `main` branch. Security fixes are applied
to the latest `main`; there are no maintained release branches yet.

| Version        | Supported          |
| -------------- | ------------------ |
| `main` (latest)| :white_check_mark: |
| Older commits  | :x:                |

## Reporting a Vulnerability

Please report security issues privately. Do **not** open a public issue,
pull request, or discussion for a suspected vulnerability, because that can
expose other users before a fix is available.

Preferred channel:

1. Open the repository's **Security** tab on GitHub.
2. Choose **Report a vulnerability** to open a private security advisory
   (GitHub private vulnerability reporting).

When reporting, please include as much of the following as you can:

- A clear description of the issue and its impact.
- Step-by-step reproduction instructions or a proof of concept.
- The affected files, routes, or configuration.
- The commit SHA or branch you tested against.

### What to expect

- Acknowledgement of your report, typically within a few business days.
- An initial assessment and severity triage after reproduction.
- Coordination on a fix and a disclosure timeline before any public details
  are shared.

We welcome good-faith security research. Please avoid privacy violations,
data destruction, and service disruption while testing, and give the
maintainers a reasonable opportunity to respond before any public disclosure.

## Security Model and Known Limitations

The following behaviors are **intentional** for the current local MVP and are
**not** considered vulnerabilities. Reports about them will likely be closed
as by-design, so please review this list first.

- **Local demo authentication is not real authentication.** The default
  `LocalBackend` does not collect, store, or verify passwords. Local profile
  resume is email-only and intended for a single-device demo. Do not use real
  credentials with the local demo.
- **Client-side storage.** Local profiles and progress live in the browser's
  `localStorage`, and the active session lives in tab-scoped `sessionStorage`.
  This data is not encrypted and is not synced to any server. Sign out before
  sharing a device or browser profile.
- **No hosted backend yet.** Firebase and Supabase adapters are not wired into
  the runtime. Selecting `VITE_BACKEND_PROVIDER=firebase` before the adapter is
  complete causes the app to fail closed with a setup error rather than fall
  back to local mode.

The following areas **are** in scope and we appreciate reports about them:

- Leakage of secrets or credentials committed to the repository. Real Firebase
  config belongs in an untracked `.env.local`; only `.env.example` (with empty
  values) is committed.
- Cross-site scripting (XSS), injection, or unsafe handling of user-provided
  input in the app.
- Gaps in `firestore.rules`. The intended posture is per-user ownership keyed
  to `request.auth.uid`, append-only attempt events, read-only published
  content, and default-deny for everything else.
- Authentication, session, or authorization flaws in the hosted backend once
  the Firebase adapter is wired in.
- Vulnerable or malicious dependencies, and supply-chain or build-pipeline
  weaknesses. `npm audit` is expected to report zero vulnerabilities.

## Handling Secrets

- Never commit real Firebase keys or other secrets. Use `.env.local`, which is
  ignored by Git.
- Treat any secret that lands in Git history as compromised: rotate it and,
  where applicable, restrict the affected keys in the provider console.
