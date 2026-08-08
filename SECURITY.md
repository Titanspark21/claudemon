# Security

claudemon is a local terminal game. It has no account, no backend and no runtime
dependencies, and nothing about you leaves the machine. Still, it does three things
worth a second look, and a problem in any of them is worth reporting:

- It **installs a command and a status line**, writes to `~/.claude/settings.json`
  and puts a launcher on your PATH (`tools/install.mjs`).
- It **runs as a Claude Code hook**, reading the JSON that Claude Code sends it on
  stdin (`scripts/`).
- It **makes two kinds of outbound request**: the sprite download at install time,
  and a daily `GET` of the plugin manifest to check for a new version — which can be
  switched off entirely under **Option**.

## Supported versions

Only the latest release gets fixes. The version sits at the right-hand end of the
home screen's bottom row; `[u]` on that screen updates.

## Reporting

Please do **not** open a public issue for a security problem. Email
**sergiozamarro@hotmail.com** instead.

Include what you found, how to reproduce it, and what an attacker gets out of it.
You will get an acknowledgement within a few days. This is a personal project run in
spare time, so there is no bounty and no formal SLA, but anything real gets fixed
and credited in the release notes unless you would rather it were not.
