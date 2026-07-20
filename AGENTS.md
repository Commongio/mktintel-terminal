<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:obsidian-decision-log -->
# Obsidian decision log

Use my Obsidian vault as the decision log for this build. It's registered as vault
`"Vault"` (`C:\Users\Giof1\Vault`) and the Obsidian CLI is enabled. Obsidian must be
running for these commands to work; if a command errors with "vault not found" or the
CLI is unavailable, note it and continue — don't block the build on it.

**BEFORE any architectural or design decision**, search the vault first:

```
obsidian vault="Vault" search query="<topic>" limit=5
obsidian vault="Vault" read path="work/decisions/<note>.md"
```

If a prior decision exists, follow it or flag the conflict explicitly — don't silently diverge.

**AFTER making or changing a significant decision** (architecture, dependency choice,
data model, API contract, notable tradeoff), record it:

```
obsidian vault="Vault" create path="work/decisions/mktintel — <Decision>.md" silent \
  content="## Context\n<why it came up>\n## Decision\n<what was chosen>\n## Alternatives\n<rejected + why>\n## Date\n<YYYY-MM-DD>"
```

Use `path=` with the full `work/decisions/...md` path — NOT `folder=`+`name=`, which drops
the note in the vault root.

If a decision note already exists, append instead of recreating:

```
obsidian vault="Vault" append path="work/decisions/<note>.md" content="..."
```

Link related notes with `[[wikilinks]]` and see [[Decisions]] for the index. Keep code
OUT of the vault — only decisions, rationale, and handoff context belong there. At the
end of a working session, write a short handoff note the same way.
<!-- END:obsidian-decision-log -->
