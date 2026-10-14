#!/usr/bin/env bash
# Per-branch record of pre-review steps, kept where every session and worktree
# of the repo can read it: <git-common-dir>/claude-reviews/<branch>/.
# Untracked, so it never lands in a commit.
#
#   review_log.sh status               what has run against HEAD, CI for HEAD, the next step
#   review_log.sh save <kind> <file>   store a review report for HEAD (kind: spec-review, code-review, pr-comments),
#                                      or a pipeline gate record (kind: plan, visual)
#   review_log.sh triage <kind> <file> store the triage of the newest <kind> report
#   review_log.sh mark <step> [note]   record a step with no report (screenshots, pr-description)
#   review_log.sh show <kind>          print the newest <kind> report and its triage
#   review_log.sh dir                  print the log directory

set -euo pipefail

STEPS=(spec-review code-review screenshots pr-description)
REPORT_KINDS=(spec-review code-review pr-comments)
# Gate records the pipeline skill saves (G2 plan, G3 visual answers), so a
# fresh session resumes a branch without re-deriving them.
GATE_KINDS=(plan visual)

branch=$(git branch --show-current)
[[ -n "$branch" ]] || { echo "review_log: detached HEAD; check out the branch under review" >&2; exit 2; }
head=$(git rev-parse --short HEAD)
log_dir="$(git rev-parse --path-format=absolute --git-common-dir)/claude-reviews/${branch//\//__}"
mkdir -p "$log_dir"

# Newest file for a kind: entries are named <epoch>-<sha>-<kind>.md, so a
# lexical sort is a time sort.
newest() { ls "$log_dir" 2>/dev/null | grep -E "^[0-9]+-[0-9a-f]+-$1\.md$" | sort | tail -1 || true; }
sha_of() { echo "$1" | cut -d- -f2; }

# <sha> itself when HEAD still contains it; after a rebase, the commit in HEAD's
# recent history with the same subject; empty when neither exists.
equivalent_of() {
  if git merge-base --is-ancestor "$1" HEAD 2>/dev/null; then echo "$1"; return; fi
  local subject
  subject=$(git log -1 --format=%s "$1" 2>/dev/null) || return 0
  git log -n 300 --format='%h%x09%s' HEAD | awk -F'\t' -v s="$subject" '$2 == s { print $1; exit }'
}

# Commits on HEAD since <sha>, or "rebased" when no equivalent commit is found.
commits_since() {
  local at
  at=$(equivalent_of "$1")
  if [[ -n "$at" ]]; then git rev-list --count "$at..HEAD"; else echo rebased; fi
}

# The HEAD a triage was saved at, read from its header.
triaged_at() { head -1 "$log_dir/$1" | sed -nE 's/.* at ([0-9a-f]+) .*/\1/p'; }

pr_base() {
  local base
  base=$(gh pr view --json baseRefName,number -q '"\(.baseRefName) (PR #\(.number))"' 2>/dev/null || true)
  if [[ -n "$base" ]]; then echo "$base"; else
    echo "$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's|^origin/||' || echo master) (no PR)"
  fi
}

ci_for_head() {
  local runs
  runs=$(gh run list --branch "$branch" --commit "$(git rev-parse HEAD)" \
    --json workflowName,status,conclusion,databaseId \
    -q '.[] | "\(.workflowName): \(if .status == "completed" then .conclusion else .status end) (run \(.databaseId))"' 2>/dev/null || true)
  if [[ -n "$runs" ]]; then echo "$runs"; else
    if [[ -z "$(git rev-list '@{upstream}..HEAD' 2>/dev/null || echo unpushed)" ]]; then
      echo "none for HEAD (pushed, but no run found)"
    else
      echo "none for HEAD (HEAD is not pushed)"
    fi
  fi
}

write_entry() { # <kind> <file> <label>
  local src=$2 dest
  [[ -f "$src" ]] || { echo "review_log: no such file $src" >&2; exit 2; }
  dest="$log_dir/$(date +%s)-$head-$1.md"
  { echo "<!-- $3 · branch $branch · HEAD $head · $(date '+%Y-%m-%d %H:%M') -->"; cat "$src"; } > "$dest"
  echo "$dest"
}

case "${1:-status}" in
  dir) echo "$log_dir" ;;

  save)
    kind=${2:?usage: review_log.sh save <kind> <file>}
    write_entry "$kind" "${3:?usage: review_log.sh save <kind> <file>}" "$kind report"
    ;;

  triage)
    kind=${2:?usage: review_log.sh triage <kind> <file>}
    report=$(newest "$kind")
    [[ -n "$report" ]] || { echo "review_log: no $kind report to triage; save one first" >&2; exit 2; }
    # Named for the report's sha so the two pair up; the header records the HEAD
    # it was saved at, after the fix commits, which is where staleness counts from.
    head=$(sha_of "$report") write_entry "$kind-triage" "${3:?usage: review_log.sh triage <kind> <file>}" "triage of $report at $(git rev-parse --short HEAD)"
    ;;

  mark)
    step=${2:?usage: review_log.sh mark <step> [note]}
    note=$(mktemp); echo "${3:-done}" > "$note"
    write_entry "$step" "$note" "$step"
    rm -f "$note"
    ;;

  show)
    kind=${2:?usage: review_log.sh show <kind>}
    report=$(newest "$kind")
    [[ -n "$report" ]] || { echo "no $kind report on $branch"; exit 0; }
    cat "$log_dir/$report"
    triage=$(newest "$kind-triage")
    if [[ -n "$triage" && "$(sha_of "$triage")" == "$(sha_of "$report")" ]]; then
      printf '\n---\n'; cat "$log_dir/$triage"
    fi
    ;;

  status)
    echo "branch: $branch   HEAD: $head"
    echo "base:   $(pr_base)"
    echo "CI:     $(ci_for_head | paste -sd ';' - | sed 's/;/; /g')"
    for kind in "${GATE_KINDS[@]}"; do
      entry=$(newest "$kind")
      if [[ -n "$entry" ]]; then echo "$kind:$(printf '%*s' $((7 - ${#kind})) '') saved at $(sha_of "$entry") (review_log.sh show $kind)"
      else echo "$kind:$(printf '%*s' $((7 - ${#kind})) '') none"; fi
    done
    echo
    next=""
    printf '%-15s %-9s %-14s %s\n' step at since-then triage
    for step in "${STEPS[@]}" pr-comments; do
      entry=$(newest "$step")
      if [[ -z "$entry" ]]; then
        printf '%-15s %-9s %-14s %s\n' "$step" - - -
        [[ "$step" == pr-comments ]] || next=${next:-"run $step"}
        continue
      fi
      sha=$(sha_of "$entry"); from=$sha; since=$(commits_since "$sha")
      triage_state=-
      if [[ " ${REPORT_KINDS[*]} " == *" $step "* ]]; then
        t=$(newest "$step-triage")
        if [[ -n "$t" && "$(sha_of "$t")" == "$sha" ]]; then
          triage_state=done
          at=$(triaged_at "$t"); [[ -n "$at" ]] && { from=$at; since=$(commits_since "$at"); }
        else
          triage_state=MISSING
          next=${next:-"triage $step $sha (review_log.sh show $step)"}
        fi
      fi
      case "$since" in
        0) since_label="current" ;;
        rebased) since_label="rebased away"; next=${next:-"re-run $step: $sha is no longer in HEAD's history"} ;;
        *) since_label="$since commits"
           [[ "$step" == pr-comments ]] || next=${next:-"re-run $step on $from..HEAD"} ;;
      esac
      printf '%-15s %-9s %-14s %s\n' "$step" "$sha" "$since_label" "$triage_state"
    done
    echo
    echo "next:   ${next:-nothing outstanding for HEAD}"
    ;;

  *) sed -n '2,13p' "$0"; exit 2 ;;
esac
