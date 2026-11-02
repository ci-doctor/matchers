# Contributing a matcher

A matcher is data, not code: one YAML file plus the job logs that prove it. Every
matcher is shown to every user who includes its bundle, its regexes run on every line
of their logs, and its `description` goes into the LLM prompt — so the bar is high and
mostly enforced by CI.

## 1. Setup

```sh
mise install    # uv and gitleaks
```

Everything runs through `ci-doctor matchers …` (pulled by `uvx`, no install needed).

## 2. Add a matcher

1. **Pick the ecosystem**, the first `classification` tag. Reuse one when it fits
   (`python`, `js`, `go`, `rust`, `jvm`, `dotnet`, `ruby`, `php`, `c`, `container`, `iac`,
   `any`); a new one is just a new directory.
2. **Write `matchers/<eco>/<id>/matcher.yaml`.** The `id` is `snake_case`, starts with the
   tool's name, and equals the directory name.

   ```yaml
   id: mytool
   role: tool                          # tool | wrapper | fallback
   classification: [python, test]      # ecosystem first
   description: >-
     Acme's build CLI. `MYTOOL ERROR <file>:<line>` is a config error in that file, not a code bug.
   pattern: '^MYTOOL ERROR'            # or start:/end: for a block, exactly one form
   exclude: ['^MYTOOL ERROR: retrying'] # anchor lines to reject; RE2 has no lookaround
   before: 2
   after: 10
   ```

3. **Add fixtures** under `matchers/<eco>/<id>/fixtures/`: at least **3 positive** and
   **2 negative** logs (§4).
4. **Generate and review:** `mise run update` writes each fixture's `.expected`. Read
   every one: it is exactly what ci-doctor will hand a reader.
5. **Check and index:** `mise run verify && mise run index`, then commit the matcher,
   the fixtures, the `.expected` files and `index.yaml` together.

## 3. Writing a good matcher

- **Anchor on the cause, not a summary line.** A summary-only anchor windows *past* the
  detail above it.
- **Anchor on something only your tool prints.** Two traps have shipped before:
  - *The runner trap.* Every failed job ends with `ERROR: Job failed: exit code N`
    (GitLab) or `##[error]Process completed with exit code N.` (GitHub). A pattern like
    `^ERROR: .*failed` fires on every log while proving nothing — `bazel` once opened a
    window on 40 of 41 logs that way.
  - *The wrong-tool trap.* `jest`'s `^FAIL ` matched `go test`'s `FAIL example.com/pkg`.
    Your negative fixtures are where you pin these.
- **Role** says what the output *is*. A `tool` prints the failure itself (tsc, pytest, a
  traceback). A `wrapper` reports that a child process failed (npm, make, gradle) and
  prints after it, so it never outranks a tool. `fallback` is for generic shapes. When
  the evidence is over budget, ci-doctor drops `fallback` windows first, then `wrapper`.
  A tool whose output is of both kinds is two matchers.
- **Prefer a `start`/`end` block** over a large `after`, and use `exclude` rather than
  negative logic in the pattern.
- **`description` is prompt text.** The model knows jest, not an in-house deploy CLI, so
  say what the tool is and what its failure *means* (`E-LOCK: another deploy holds the
  lock, not a code bug`), not only which lines the window keeps.

### Rules CI enforces

| Field | Rule |
|---|---|
| regexes | RE2 only (no lookaround, no backreferences, `\z` not `\Z`, repeats ≤ 1000; `\d \s \w \b` are ASCII-only). At most 500 characters and a small compiled program. `pattern`/`start`/`end` must not match an empty line. At most 20 `exclude` entries. |
| `before` / `after` | 0–100 |
| `description` | required, one line, printable ASCII, 20–250 characters, and nothing that reads like instructions to the model or a chat-role tag (`system:`, `<\|`) or a URL |
| `classification` | 1–5 lower-case tags; the first equals the directory under `matchers/` |
| `id` | `snake_case`, starts with a letter, equals the directory name, unique across matchers and bundles |

## 4. Fixtures

Each fixture is a `<case>.log` plus a generated `<case>.expected`.

- **Positive** (non-empty `.expected`): the lines the matcher must catch, exactly. Cover
  *different shapes* of the tool's output — one failure, several, another version or flag
  — not three copies of one.
- **Negative** (empty `.expected`): the matcher must not fire. Use a log that looks close:
  a neighbouring tool, or the same tool passing with warnings. Copying another matcher's
  fixture in is fine and costs nothing.
- **Raw CI logs work as they are.** GitHub's timestamps and `##[group]` lines and GitLab's
  section markers are stripped before matching, exactly as `ci-doctor analyze` does.
  Plain tool output works too.
- **Redact** tokens, hostnames, emails and internal URLs. Logs come from public projects
  or are synthetic; link the source in the PR. Keep each under 200 KB and trim unrelated
  steps. CI runs gitleaks over every PR.
- A log that contains two tools (`npm run build` running `tsc`) can be a fixture of both,
  each with its own `.expected`.

`verify-exempt.txt` lists the matchers migrated from ci-doctor before this bar existed;
they need one positive fixture until backfilled. The list only shrinks — CI rejects a PR
that adds to it.

## 5. Names are permanent

Users write names into their configs, so renaming or deleting one breaks their setup on
the next run. To retire a matcher: remove it from every bundle, set
`description: "DEPRECATED: use X"`, and delete it in a later PR. CI rejects removing a
name that was not deprecated first.

## 6. Bundles

`bundles/<id>.yaml` lists names from this registry (bundles may include bundles, up to 5
deep, no cycles). There is one per ecosystem, plus `all`. Add a new matcher to its
ecosystem's bundle in the same PR.

## 7. The pull request

- Branch `<type>/<slug>` (`feat/hypothesis-matcher`); the PR title is a Conventional
  Commit — `feat(python): add the hypothesis matcher`. One matcher per PR.
- Fill in the template's checklist. A maintainer reviews the `.expected` diffs above all.
- `all-green` must pass: verify + index, the base-branch guards, gitleaks, and the
  workflow audit.
