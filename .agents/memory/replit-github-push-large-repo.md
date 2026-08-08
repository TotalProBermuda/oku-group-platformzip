---
name: Pushing a large Replit repo to GitHub
description: How to push a Replit workspace with 5+ GiB of git history to a GitHub repo without timeouts or authentication failures.
---

## The problem
Replit accumulates 5–6 GiB of git objects from task-agent sub-repos. Direct HTTPS push times out. Shallow clone push fails because GitHub rejects shallow commits whose parent doesn't exist on the remote.

## The solution: fast-import orphan root commit

1. Shallow-clone the workspace to /tmp (strips history, keeps current files):
   ```bash
   git clone --depth=1 --no-local "file:///home/runner/workspace" /tmp/shallow-push
   ```

2. Use `git fast-import` to create a true root commit (no parent) that references the existing blob SHAs:
   ```bash
   MSG="Your commit message"
   MSGLEN=$(printf '%s' "$MSG" | wc -c)
   {
     printf "commit refs/heads/clean-root\n"
     printf "committer Name <email> %s +0000\n" "$(date +%s)"
     printf "data %d\n" "$MSGLEN"
     printf "%s\n" "$MSG"
     git -C /tmp/shallow-push ls-tree -r HEAD \
       | awk -F'\t' '{split($1,a," "); printf "M %s %s %s\n", a[1], a[3], $2}'
     printf "\ndone\n"
   } | git -C /tmp/shallow-push fast-import
   ```

3. Push the orphan commit to GitHub:
   ```bash
   git -C /tmp/shallow-push push \
     "https://TOKEN@github.com/OWNER/REPO.git" \
     clean-root:main
   ```

**Why:** Orphan root commit has no parent reference, so GitHub accepts it unconditionally. All blob objects are sent in the pack (~650 MB for this project), which transfers in ~20–65 seconds.

**Why the repo was so large:** Task agents each create their own git subrepos that get merged back, bloating `.git/objects` with each merge cycle.
