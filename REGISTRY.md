# Hosting your own registry

A registry is any directory with this layout and an `index.yaml` at its root. Use one
for in-house tools, for a fork of an official matcher you want to change, or as an
offline mirror of this repo.

```
index.yaml
matchers/<ecosystem>/<id>/matcher.yaml
matchers/<ecosystem>/<id>/fixtures/<case>.log + <case>.expected
bundles/<id>.yaml
```

## Build it

The same commands as this repo:

```sh
ci-doctor matchers verify --update .   # write the .expected files, then read them
ci-doctor matchers verify .            # golden fixtures and every validation rule
ci-doctor matchers index .             # write index.yaml
```

Rules and fixture conventions are in [CONTRIBUTING.md](CONTRIBUTING.md). ci-doctor
re-checks every file it loads, so a registry that skipped `verify` still cannot hand it
an invalid matcher.

## Publish and register it

Point ci-doctor at the **directory**, never at `index.yaml`. Every host can be reached
in more than one way; pick whichever suits your setup.

| Host | Publish | Register (any of) |
|---|---|---|
| Local disk or NFS | nothing | `ci-doctor matchers registry add acme=/mnt/nfs/matchers` or `acme=file:///mnt/nfs/matchers` |
| Git repo (GitHub, GitLab) | push | over HTTPS: `acme=https://raw.githubusercontent.com/acme/matchers/main/` (`/<tag>/` to pin)<br>over git: `acme=git+https://gitlab.internal/platform/matchers.git@v3` or `acme=git+ssh://git@github.com/acme/matchers.git@main`, plus `#subdirectory=registry` when it is not at the repo root |
| Static or internal web server, GitHub Pages | copy or deploy the tree | `acme=https://matchers.acme.dev/` or `acme=http://matchers.internal/` |
| S3 or S3-compatible (MinIO …) | `aws s3 sync . s3://bucket/matchers/` | over HTTP(S): `acme=https://bucket.s3.amazonaws.com/matchers/`<br>over the S3 API: `acme=s3://bucket/matchers/`, with `pip install ci-doctorr[s3]` and the standard AWS credentials (`AWS_ENDPOINT_URL_S3` for an S3-compatible store) |

Then pick from it like any registry:

```yaml
matchers:
  registries:
    acme: https://matchers.acme.dev/
  include: [official/python, acme/deploy_cli]
```

Worth knowing:

- **Plain `http://` works**, but nothing protects the files in transit; ci-doctor logs a
  warning on every run that uses one.
- **git registries use the job's own git credentials** — SSH keys, a credential helper,
  or on GitLab `CI_JOB_TOKEN`:

  ```sh
  git config --global url."https://gitlab-ci-token:${CI_JOB_TOKEN}@gitlab.internal/".insteadOf "https://gitlab.internal/"
  ```

- **A presigned S3 URL can't be a registry**: it signs one object, and ci-doctor fetches
  many relative to the folder.
- **Pinning:** point at an immutable ref — a tag or commit in a raw URL, or `@<tag>` on a
  `git+` URL.
- **Air-gapped:** `git clone https://github.com/ci-doctor/matchers` and register the path
  as `official` to replace the built-in one.

> `git+https://`, `git+ssh://` and `s3://` arrive with E11 phase 8; paths, `file://`,
> `http://` and `https://` work from the first release with registries.
