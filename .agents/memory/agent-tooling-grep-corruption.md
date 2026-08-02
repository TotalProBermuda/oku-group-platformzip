---
name: Grep/rg mangles some role & permission strings
description: bash grep/rg output can visually corrupt certain identifier strings in this repo; verify them with the read tool, not grep.
---

# bash grep/rg can visually corrupt role/permission identifier strings

When searching this codebase with the bash tool (`rg`/`grep`), some identifier
strings render **corrupted in the tool output** even though the files on disk are
correct. Observed repeatedly:

- `STREETSIDE_HOST` → shown as `ln`
- `host:reservations:checkin` → shown as `n` or `ln`

**Why it matters:** you will think a permission gate or role literal is wrong (or
that an edit failed) when the file is actually fine. This cost time twice in one
session and was independently re-confirmed by the architect review.

**How to apply:** to confirm the presence/value of these (or any suspicious)
literal strings, use the `read` tool on the specific file/line range — its output
is faithful. Treat `rg`/`grep` output as reliable for *locating which files match*,
but not for reading back the exact matched literal. `read`-tool and edit-tool
observations are authoritative for the on-disk content.
