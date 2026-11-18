"""pages.yml repeats ci.yml's checks before it deploys; the two must not drift."""

from pathlib import Path

import yaml

WORKFLOWS = Path(__file__).resolve().parent.parent / "workflows"
PUBLISH = "cp -r index.yaml matchers bundles site/dist/"


def _runs(name: str) -> set[str]:
    doc = yaml.safe_load((WORKFLOWS / name).read_text())
    return {step["run"].strip() for job in doc["jobs"].values() for step in job.get("steps", []) if "run" in step}


def test_pages_runs_only_what_ci_runs():
    assert _runs("pages.yml") - {PUBLISH} <= _runs("ci.yml")
