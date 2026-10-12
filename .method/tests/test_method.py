"""Behavioral tests for selective retrieval, safe drafts and truthful validation."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import shutil
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('method', ROOT / 'tools' / 'method.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class MethodTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='method-v6-')
        self.root = Path(self.tmp.name) / 'kit'
        shutil.copytree(ROOT, self.root, ignore=shutil.ignore_patterns('__pycache__'))
        self.assertEqual(self.run_cli('reindex')[0], 0)

    def tearDown(self):
        self.tmp.cleanup()

    def run_cli(self, *args):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = m.main(['--root', str(self.root), *args])
        return code, out.getvalue(), err.getvalue()

    def edit_state(self, **fields):
        p = m.project(self.root)
        p.update(fields)
        (self.root / 'project.json').write_text(m.encode(p), encoding='utf-8')

    def create_work(self):
        code, out, err = self.run_cli('new', 'work', 'W-042', '--title', 'Export bilingue', '--summary', 'French and English exports')
        self.assertEqual(code, 0, err)
        return self.root / 'work' / 'W-042.html'

    def test_kit_validates(self):
        self.assertEqual(self.run_cli('validate')[0], 0)

    def test_context_excludes_unrequested_manual(self):
        code, out, err = self.run_cli('context')
        self.assertEqual(code, 0, err)
        self.assertIn('REF core', out)
        self.assertIn('REF profile', out)
        self.assertNotIn('REF security', out)
        self.assertNotIn('REF migration', out)
        self.assertLess(len(out), 5000)

    def test_read_excludes_html_shell_but_preserves_links(self):
        code, out, err = self.run_cli('read', 'core')
        self.assertEqual(code, 0, err)
        self.assertIn('language.html#language', out)
        self.assertNotIn('<html', out)
        self.assertNotIn('method.css', out)
        self.assertNotIn('METHOD / V6', out)

    def test_read_reports_status(self):
        self.assertIn('| draft |', self.run_cli('read', 'profile')[1])

    def test_search_returns_metadata_without_body(self):
        code, out, err = self.run_cli('search', 'sécurité')
        self.assertEqual(code, 0, err)
        self.assertIn('security |', out)
        self.assertNotIn('Identify protected assets', out)

    def test_full_text_finds_content_not_in_metadata(self):
        self.assertIn('No match', self.run_cli('search', 'pseudonymize')[1])
        self.assertIn('security |', self.run_cli('search', 'pseudonymize', '--full-text')[1])

    def test_unknown_reference_fails(self):
        code, out, err = self.run_cli('read', 'missing')
        self.assertEqual(code, 1)
        self.assertEqual(out, '')
        self.assertIn('Unknown record', err)

    def test_over_budget_returns_no_truncated_rules(self):
        code, out, err = self.run_cli('read', 'core', '--max-chars', '30')
        self.assertEqual(code, 1)
        self.assertEqual(out, '')
        self.assertIn('Nothing was truncated', err)

    def test_stale_selected_file_is_rejected(self):
        p = self.root / 'docs' / 'core.html'
        p.write_text(p.read_text(encoding='utf-8').replace('Ship small', 'Ship useful'), encoding='utf-8')
        self.assertEqual(self.run_cli('read', 'core')[0], 1)
        self.assertEqual(self.run_cli('search', 'scope')[0], 1)
        self.assertEqual(self.run_cli('reindex')[0], 0)
        self.assertEqual(self.run_cli('read', 'core')[0], 0)

    def test_new_file_makes_search_stale(self):
        self.create_work()
        self.assertIn('Index stale', self.run_cli('search', 'work')[2])

    def test_deleted_file_makes_search_stale(self):
        (self.root / 'docs' / 'security.html').unlink()
        self.assertEqual(self.run_cli('search', 'security')[0], 1)

    def test_duplicate_ids_rejected(self):
        shutil.copyfile(self.root / 'docs' / 'core.html', self.root / 'docs' / 'duplicate.html')
        self.assertIn('Duplicate record id', self.run_cli('reindex')[2])

    def test_broken_link_does_not_replace_index(self):
        previous = (self.root / 'index.json').read_bytes()
        p = self.root / 'docs' / 'core.html'
        p.write_text(p.read_text(encoding='utf-8').replace('quality.html#quality', 'missing.html#quality'), encoding='utf-8')
        self.assertEqual(self.run_cli('reindex')[0], 1)
        self.assertEqual(previous, (self.root / 'index.json').read_bytes())

    def test_broken_anchor_rejected(self):
        p = self.root / 'docs' / 'core.html'
        p.write_text(p.read_text(encoding='utf-8').replace('quality.html#quality', 'quality.html#missing'), encoding='utf-8')
        self.assertIn('missing anchor', self.run_cli('reindex')[2])

    def test_generated_state_view_drift_detected(self):
        self.edit_state(next_action='New instruction')
        self.assertEqual(self.run_cli('validate')[0], 1)
        self.assertEqual(self.run_cli('reindex')[0], 0)
        self.assertIn('New instruction', (self.root / 'index.html').read_text(encoding='utf-8'))

    def test_state_pointer_must_resolve(self):
        self.edit_state(focus_id='W-404')
        self.assertIn('unresolved active record', self.run_cli('reindex')[2])

    def test_template_cannot_claim_adoption_ready(self):
        self.assertEqual(self.run_cli('validate', '--project-ready')[0], 1)
        self.assertEqual(self.run_cli('context', '--task', 'tpl-work')[0], 1)

    def test_state_requires_real_work_focus(self):
        self.edit_state(focus_id='core')
        self.assertIn('focus_id must reference work', self.run_cli('reindex')[2])

    def test_context_contains_only_selected_work(self):
        self.create_work()
        self.edit_state(focus_id='W-042')
        self.assertEqual(self.run_cli('reindex')[0], 0)
        code, out, err = self.run_cli('context')
        self.assertEqual(code, 0, err)
        self.assertIn('REF W-042', out)
        self.assertNotIn('REF tpl-work', out)

    def test_new_record_corrects_links_and_preserves_unicode(self):
        p = self.create_work()
        self.assertEqual(self.run_cli('reindex')[0], 0)
        self.assertEqual(self.run_cli('validate')[0], 0)
        self.assertIn('Export bilingue', p.read_text(encoding='utf-8'))
        self.assertIn('../templates/decision.html', p.read_text(encoding='utf-8'))

    def test_new_record_does_not_overwrite(self):
        p = self.create_work()
        before = p.read_bytes()
        self.assertEqual(self.run_cli('new', 'work', 'W-042', '--title', 'Other', '--summary', 'Other')[0], 1)
        self.assertEqual(before, p.read_bytes())

    def test_new_record_rejects_case_collision_and_traversal(self):
        self.create_work()
        for ident in ('w-042', '../escaped', '/absolute'):
            with self.subTest(ident=ident):
                self.assertEqual(self.run_cli('new', 'work', ident, '--title', 'X', '--summary', 'Y')[0], 1)

    def test_title_is_text_not_html(self):
        code, out, err = self.run_cli('new', 'decision', 'D-002', '--title', '<script>alert(1)</script>', '--summary', 'A & B')
        self.assertEqual(code, 0, err)
        self.assertEqual(self.run_cli('reindex')[0], 0)
        self.assertNotIn('<script>alert(1)</script>', (self.root / 'records' / 'D-002.html').read_text(encoding='utf-8'))

    def test_archived_history_is_opt_in(self):
        p = self.create_work()
        p.write_text(p.read_text(encoding='utf-8').replace('data-status="draft"', 'data-status="archived"'), encoding='utf-8')
        self.assertEqual(self.run_cli('reindex')[0], 0)
        self.assertNotIn('W-042 |', self.run_cli('search', 'W-042')[1])
        self.assertIn('W-042 |', self.run_cli('search', 'W-042', '--archive')[1])

    def test_accepted_authority_is_required_for_active_pointer(self):
        self.run_cli('new', 'authorization', 'AUTH-002', '--title', 'Authority', '--summary', 'Scope')
        self.edit_state(external_authorizations=['AUTH-002'])
        self.assertIn('accepted authorization', self.run_cli('reindex')[2])

    def test_ready_flags_do_not_hide_placeholders(self):
        self.create_work()
        self.edit_state(template=False, focus_id='W-042')
        for rel in ('docs/profile.html', 'docs/roadmap.html', 'work/W-042.html'):
            p = self.root / rel
            p.write_text(p.read_text(encoding='utf-8').replace('data-status="draft"', 'data-status="ready" data-components="test"'), encoding='utf-8')
        self.assertEqual(self.run_cli('reindex')[0], 0)
        self.assertIn('Unfilled project record', self.run_cli('validate', '--project-ready')[2])

    def test_parser_preserves_code_and_decodes_entities(self):
        raw = '<article data-method><h1>A &amp; B</h1><pre>x = 1\n  y = 2</pre><script>hidden()</script><p>Fin.</p></article>'
        text = m.Page(raw, 'test').text
        self.assertIn('A & B', text)
        self.assertIn('x = 1\n  y = 2', text)
        self.assertNotIn('hidden()', text)

    def test_parser_rejects_malformed_html(self):
        with self.assertRaises(m.MethodError):
            m.Page('<article><p>Oops</article>', 'bad')

    def test_paths_cannot_escape_root(self):
        with self.assertRaises(m.MethodError):
            m.safe_path(self.root, '../outside')

    def test_invalid_state_types_are_rejected(self):
        self.edit_state(blocked_on='not a list')
        self.assertIn('must contain record ids', self.run_cli('reindex')[2])

    def test_index_regeneration_is_deterministic(self):
        before = [(self.root / n).read_bytes() for n in ('index.json', 'index.html')]
        self.assertEqual(self.run_cli('reindex')[0], 0)
        self.assertEqual(before, [(self.root / n).read_bytes() for n in ('index.json', 'index.html')])

    def test_metrics_include_raw_entrypoint(self):
        code, out, err = self.run_cli('metrics')
        self.assertEqual(code, 0, err)
        data = json.loads(out)
        self.assertEqual(data['initial_context_with_html_entrypoint_chars'], data['bootstrap_chars_without_task'] + len((self.root / 'START.html').read_text(encoding='utf-8')))
        self.assertIn('not tokens', data['unit'])

    def test_record_kind_cannot_inject_generated_html(self):
        p = self.root / 'docs' / 'core.html'
        p.write_text(p.read_text(encoding='utf-8').replace('data-kind="guide"', 'data-kind="&lt;script&gt;"'), encoding='utf-8')
        self.assertIn('invalid record kind', self.run_cli('reindex')[2])

    def test_fresh_kit_can_generate_missing_views(self):
        (self.root / 'index.html').unlink()
        (self.root / 'index.json').unlink()
        self.assertEqual(self.run_cli('reindex')[0], 0)
        self.assertEqual(self.run_cli('validate')[0], 0)

    def test_no_markdown_shipped(self):
        self.assertEqual(list(self.root.rglob('*.md')), [])

if __name__ == '__main__':
    unittest.main()
