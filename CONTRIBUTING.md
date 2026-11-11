# Contributing a matcher

A matcher is data, not code: one YAML file plus the job logs that prove it. Every
matcher is shown to every user who includes its bundle, its regexes run on every line
of their logs, and its `description` goes into the LLM prompt — so the bar is high and
mostly enforced by CI.

## 1. Setup

```sh
mise install    # uv
```

Everything runs through `ci-doctor matchers …` (pulled by `uvx`, no install needed).

## 2. Add a matcher

1. **Pick the ecosystem directory.** Reuse one when it fits (`python`, `js`, `go`, `rust`,
   `jvm`, `dotnet`, `ruby`, `php`, `c`, `container`, `iac`, `any`); a new one is just a new
   directory, and its bundle is generated.
2. **Write `matchers/<eco>/<id>/matcher.yaml`** in
   [matcher format v1](https://docs.cidoc.dev/reference/matcher-format/). The `id` is
   `snake_case`, starts with the tool's name, and equals the directory name.

   ```yaml
   schema: 1
   id: mytool
   role: tool                          # issue | tool | gate | wrapper | fallback
   description: >-
     Acme's build CLI. `MYTOOL ERROR <file>:<line>` is a config error in that file, not a code bug.
   tags: [build]
   define:
     FILE: '[\w./-]+'
   match:
     all:
       - template: 'MYTOOL ERROR $FILE:'
       - not: { regex: 'retrying' }
   window: { before: 2, after: 10 }
   ```

   Try it on a real log while you write it: `ci-doctor matchers try matcher.yaml job.log`.

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
- **Role** says what the output *is*: `issue` (the environment failed: disk, memory,
  network), `tool` (prints the failure itself), `gate` (a deliberate check: coverage, a
  scanner, a formatter), `wrapper` (reports that a child process failed: npm, make,
  gradle), `fallback` (generic shapes). Over budget, ci-doctor drops windows in the
  reverse of that order.
- **One meaning per output.** A tool whose output means two things gets two `outputs`
  (`ruff.check`, `ruff.format`); one meaning spelled two ways gets two `variants`, each
  with its own positive fixture.
- **Prefer `window.until`** over a large `after`, and `not` over negative logic in a
  regex.
- **`description` is prompt text.** The model knows jest, not an in-house deploy CLI, so
  say what the tool is and what its failure *means* (`E-LOCK: another deploy holds the
  lock, not a code bug`), not only which lines the window keeps.

### Rules CI enforces

| Field | Rule |
|---|---|
| `schema` | `1` |
| regexes | RE2 only (no lookaround, no backreferences, `\z` not `\Z`, repeats ≤ 1000; `\d \s \w \b` are ASCII-only). At most 500 characters and 1,000 RE2 instructions after `define` expansion. A `match` must not hold on an empty line. |
| `window` | `before` / `after` 0–100; `max_lines` (1–500) required with `until` and `while` |
| `description` | required, one line, printable ASCII, 20–250 characters, and nothing that reads like instructions to the model or a chat-role tag (`system:`, `<\|`) or a URL |
| `tags` | 1–5 lower-case tags, free-form: search and filters only |
| `id` | `snake_case`, starts with a letter, equals the directory name, unique across matchers and bundles |

## 4. Fixtures

Each fixture is a log plus a generated `.expected` per output. The name declares the
framing: `<case>.github.log` and `<case>.gitlab.log` are raw CI logs, and `<case>.log` is
plain tool output, read as it is. A one-output matcher's golden is `<case>.expected`;
with several outputs each has `<case>.<output>.expected`.

- **Positive** (non-empty `.expected`): the lines the matcher must catch, exactly. Cover
  *different shapes* of the tool's output — one failure, several, another version or flag
  — not three copies of one.
- **Negative** (empty `.expected`): the matcher must not fire. Use a log that looks close:
  a neighbouring tool, or the same tool passing with warnings. Copying another matcher's
  fixture in is fine and costs nothing.
- **Every variant needs a positive fixture**, and no output except a `fallback` may fire
  on the runner's own "job failed" line; `verify` checks both.
- **Redact** tokens, hostnames, emails and internal URLs. Logs come from public projects
  or are synthetic; link the source in the PR. Keep each under 200 KB and trim unrelated
  steps.
- A log that contains two tools (`npm run build` running `tsc`) can be a fixture of both,
  each with its own `.expected`.

`verify-exempt.txt` lists the matchers migrated from ci-doctor before this bar existed;
they need one positive fixture until backfilled. The list only shrinks — CI rejects a PR
that adds to it.

## 5. Names are permanent

Users write names into their configs (`include`, and output ids in `exclude`), so
renaming or deleting one breaks their setup on the next run. To retire a matcher: remove it from every bundle, set
`description: "DEPRECATED: use X"`, and delete it in a later PR. CI rejects removing a
name that was not deprecated first.

## 6. Bundles

`mise run index` generates one bundle per ecosystem directory; never edit those. Curated
bundles (`all`) are hand-written `bundles/<id>.yaml` lists of names from this registry
(bundles may include bundles, up to 5 deep, no cycles).

## 7. The pull request

- Branch `<type>/<slug>` (`feat/hypothesis-matcher`); the PR title is a Conventional
  Commit — `feat(python): add the hypothesis matcher`. One matcher per PR.
- Fill in the template's checklist. A maintainer reviews the `.expected` diffs above all.
- `all-green` must pass: verify + index, the base-branch guards, and the workflow
  audit.
