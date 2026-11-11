# ci-doctor matchers

The official matcher registry for [ci-doctor](https://github.com/ci-doctor/ci-doctor).
A matcher tells ci-doctor which lines of a failed CI job's log are the evidence: the
pytest `FAILURES` block, the `tsc` error, the Go panic. This repo holds them, each one
proven against real job logs, and publishes them at
**[matchers.cidoc.dev](https://matchers.cidoc.dev)**.

Browse every matcher, its outputs and the fixtures that prove it in the [catalogue](https://matchers.cidoc.dev). Try one on your own log with `ci-doctor matchers examine official/<name> job.log`.

## Use it

```yaml
# .ci-doctor.yml
matchers:
  include: [official/python, official/js]   # bundles, or single matchers: official/pytest
```

or `ci-doctor matchers add official/python`. The `official` registry is built in; you
only name what you want from it. To pin a version, point it at a tag:

```yaml
matchers:
  registries:
    official: https://raw.githubusercontent.com/ci-doctor/matchers/v1/
```

For an air-gapped setup, `git clone` this repo and register the path instead.

## What is here

| Path | What |
|---|---|
| `matchers/<ecosystem>/<id>/matcher.yaml` | one matcher |
| `matchers/<ecosystem>/<id>/fixtures/` | the logs that prove it, each with the exact lines it must extract |
| `bundles/<id>.yaml` | a named set of matchers: one generated per ecosystem folder, plus curated ones like `all` |
| `index.yaml` | generated; what ci-doctor reads first |

## Contribute

Adding or fixing a matcher: [CONTRIBUTING.md](CONTRIBUTING.md).
Hosting your own registry: [docs.cidoc.dev/reference/registry](https://docs.cidoc.dev/reference/registry/).
