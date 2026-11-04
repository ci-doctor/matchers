from registry_guards import added_exemptions, main, removed_names

BASE = """
schema: 1
matchers:
  pytest: {path: a, sha256: x, description: "pytest failures block"}
  old_tool: {path: b, sha256: x, description: "DEPRECATED: use new_tool"}
bundles:
  python: {path: c, sha256: x, description: "python bundle"}
"""


def test_a_removed_name_is_reported():
    head = "schema: 1\nmatchers:\n  old_tool: {path: b, sha256: x, description: d}\n"
    assert removed_names(BASE, head) == ["matcher 'pytest'", "bundle 'python'"]


def test_a_deprecated_name_may_go():
    head = BASE.replace('  old_tool: {path: b, sha256: x, description: "DEPRECATED: use new_tool"}\n', "")
    assert removed_names(BASE, head) == []


def test_exemptions_only_shrink():
    assert added_exemptions("a\nb\n", "a\n") == []
    assert added_exemptions("a\n", "a\n# note\nnew\n") == ["new"]


def test_a_bad_base_ref_fails_closed(capsys):
    assert main("origin/does-not-exist") == 1
    assert "is not a commit" in capsys.readouterr().out
