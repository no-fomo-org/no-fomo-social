# Security

no-fomo-social runs on your computer and holds your Instagram session (through the extension) and your OpenAI key. We take reports about either seriously.

## Report a problem

Please do not open a public issue. Use **[Report a vulnerability](https://github.com/no-fomo-org/no-fomo-social/security/advisories/new)** on GitHub, or write to CONTACT_EMAIL.

Tell us what you found, how to reproduce it, and what an attacker could do. We answer within 7 days and tell you when a fix ships. We are happy to credit you in the release notes.

## What counts

- Another website or program on the computer can read the library, start a sync, or use the Instagram session.
- The OpenAI key leaves the computer to anywhere except OpenAI.
- The install script can be tricked into running code that is not from our releases.
- The extension sends Instagram data anywhere except the local no-fomo-social app.

## Supported versions

Only the latest release gets security fixes.
