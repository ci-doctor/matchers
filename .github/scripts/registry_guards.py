"""PR guards a registry needs on top of `ci-doctor matchers verify`.

`verify` checks the tree as it is. These compare it with the base branch, which
`verify` cannot see:

- A name users put in their `matchers.include` must not vanish, or their setup
  exits 1 on the next run. Removal is allowed only once the base already carries
  the `DEPRECATED:` description (CONTRIBUTING, "Names are permanent").
- `verify-exempt.txt` only shrinks. Listing a new matcher there would let it skip
  the 3 positive + 2 negative fixture bar.

Usage: python registry_guards.py <base-ref>   (e.g. origin/main)
"""

import subprocess
import sys
from pathlib import Path

import yaml

INDEX = "index.yaml"
EXEMPT = "verify-exempt.txt"


def removed_names(base_index: str, head_index: str) -> list[str]:
    """Names in the base index that the head dropped without a deprecation cycle."""
    base = yaml.safe_load(base_index) or {}
    head = yaml.safe_load(head_index) or {}
    out = []
    for kind in ("matchers", "bundles"):
        kept = head.get(kind) or {}
        for name, entry in (base.get(kind) or {}).items():
            if name not in kept and not str(entry.get("description", "")).startswith("DEPRECATED:"):
                out.append(f"{kind[:-1]} {name!r}")
    return out


def added_exemptions(base_exempt: str, head_exempt: str) -> list[str]:
    """Names listed in the head's verify-exempt.txt that the base did not list."""

    def names(text: str) -> set[str]:
        return {line.strip() for line in text.splitlines() if line.strip() and not line.startswith("#")}

    return sorted(names(head_exempt) - names(base_exempt))


def _at(ref: str, path: str) -> str | None:
    """A file's content at a git ref, or None when it does not exist there."""
    res = subprocess.run(["git", "show", f"{ref}:{path}"], capture_output=True, text=True)
    return res.stdout if res.returncode == 0 else None


def _read(path: str) -> str:
    p = Path(path)
    return p.read_text() if p.exists() else ""


def main(base_ref: str) -> int:
    # Fail closed: with a bad ref every `git show` misses and the guards would pass.
    verify = ["git", "rev-parse", "--verify", "--quiet", f"{base_ref}^{{commit}}"]
    if subprocess.run(verify, capture_output=True).returncode != 0:
        print(f"::error::{base_ref!r} is not a commit; fetch the base branch first.")
        return 1
    errors = []
    if (base_index := _at(base_ref, INDEX)) is not None:
        errors += [
            f"{name} was removed. Names are permanent: deprecate it first "
            '(description: "DEPRECATED: use X") and remove it in a later PR.'
            for name in removed_names(base_index, _read(INDEX))
        ]
    # The bootstrap PR creates the file, so there is nothing to compare against yet.
    if (base_exempt := _at(base_ref, EXEMPT)) is not None:
        errors += [
            f"{name!r} was added to {EXEMPT}. The list only shrinks: give the matcher "
            "3 positive and 2 negative fixtures instead."
            for name in added_exemptions(base_exempt, _read(EXEMPT))
        ]
    for e in errors:
        print(f"::error::{e}")
    if not errors:
        print(f"registry guards ok against {base_ref}")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
