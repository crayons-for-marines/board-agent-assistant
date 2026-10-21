#!/usr/bin/env bash
# SessionStart hook: delete local branches that were merged and removed on the
# remote. A branch goes only if its upstream is gone and `git cherry` finds no
# commit missing from origin/master (squash and cherry-picked merges included).
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
git fetch --quiet --prune origin

current="$(git branch --show-current)"
deleted=()
while read -r branch track; do
  [[ "$track" == "[gone]" && "$branch" != master ]] || continue
  if git cherry origin/master "$branch" | grep -q '^+'; then
    continue # has commits that aren't on master
  fi
  if [[ "$branch" == "$current" ]]; then
    [[ -z "$(git status --porcelain)" ]] || continue # don't move a dirty worktree
    git switch --quiet master
    git merge --quiet --ff-only origin/master
    current=master
  fi
  git branch --quiet -D "$branch"
  deleted+=("$branch")
done < <(git for-each-ref --format='%(refname:short) %(upstream:track)' refs/heads)

if (( ${#deleted[@]} )); then
  echo "Deleted merged branches: ${deleted[*]}"
fi
