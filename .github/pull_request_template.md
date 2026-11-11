<!-- The PR title becomes the squash commit: <type>(<scope>): <subject>, e.g.
     feat(python): add the hypothesis matcher · fix(jest): stop firing on go test's FAIL -->

## What changes

<!-- New matcher, a fix to an existing one, a bundle change, or docs. One matcher per PR
     keeps the .expected review readable. -->

## The matcher

- **Tool, and the output it anchors on:**
- **Role** (`issue` / `tool` / `gate` / `wrapper` / `fallback`), and why:
- **Ecosystem** (its directory):

## Fixtures

- [ ] At least **3 positive** fixtures (non-empty `.expected`), covering different shapes of
      the tool's output — not three copies of one failure
- [ ] At least **2 negative** fixtures (empty `.expected`): logs that look close but must
      not fire, such as a neighbouring tool or the same tool passing with warnings
- [ ] Every log is redacted (tokens, hostnames, emails, internal URLs) and comes from a
      public project, or is synthetic

**Sources** <!-- link the public job/run behind each real log, or write "synthetic" -->

## Review

- [ ] I read every `.expected` diff: it keeps the lines a reader needs to see the cause,
      and nothing that only matches the runner (`ERROR: Job failed`, `##[error]Process completed`)
- [ ] `description` says what the tool is and what its failure *means* (printable ASCII,
      20–250 characters)
- [ ] `mise run verify && mise run index` pass, and `index.yaml` is committed
- [ ] No matcher or bundle name was renamed or removed (names are permanent — see
      [CONTRIBUTING.md](../CONTRIBUTING.md#names-are-permanent))
