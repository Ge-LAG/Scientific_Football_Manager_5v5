"""End-to-end durability contracts, including actual subprocess contention."""
from datetime import date, timedelta
from html import escape
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
import test_method as legacy
m, ROOT = legacy.m, legacy.ROOT

class DurabilityTests(unittest.TestCase):
    setUp = legacy.MethodTests.setUp
    tearDown = legacy.MethodTests.tearDown
    run_cli = legacy.MethodTests.run_cli
    edit_state = legacy.MethodTests.edit_state

    def record(self, ident, kind='work', status='draft', attrs=None, body='<p>Actual scoped content.</p>'):
        metadata = {'id':ident, 'data-title':ident, 'data-summary':'Synthetic lifecycle fixture',
                    'data-tags':'synthetic test', 'data-kind':kind, 'data-status':status,
                    'data-owner':'tester', 'data-revision':'1'}
        metadata.update(attrs or {})
        fields = ' '.join(f'{k}="{escape(str(v), quote=True)}"' for k,v in metadata.items())
        p=self.root / 'records' / (ident+'.html')
        p.parent.mkdir(exist_ok=True)
        p.write_text('<!doctype html><html lang="en"><head><title>Fixture</title></head><body><article data-method '+fields+'><h1>'+ident+'</h1>'+body+'</article></body></html>',encoding='utf-8')
        return p

    def meta(self, p, **attrs):
        text=p.read_text(encoding='utf-8')
        for key,value in attrs.items():
            key='data-'+key.replace('_','-')
            if re.search(key+r'="[^"]*"',text):
                text=re.sub(key+r'="[^"]*"',lambda _:key+'="'+escape(str(value),quote=True)+'"',text,count=1)
            else:
                text=text.replace('<article data-method','<article data-method '+key+'="'+escape(str(value),quote=True)+'"',1)
        p.write_text(text,encoding='utf-8')

    def bindings(self, ident):
        code,out,err=self.run_cli('fingerprint',ident)
        self.assertEqual(code,0,err)
        return json.loads(out)

    def constraint(self, ident='C-A', requires='', **attrs):
        a={'data-applies-to':'auth','data-reviewed':date.today().isoformat(),
           'data-review-by':(date.today()+timedelta(days=30)).isoformat(),
           'data-review-trigger':'authorization or contract changes','data-requires':requires}
        a.update(attrs)
        p=self.record(ident,'constraint',attrs=a)
        self.meta(p,review_digest=self.bindings(ident)['review_digest'],status='active')
        return p

    def closed_work(self, ident='W-A', **attrs):
        (self.root/'code.txt').write_text('version one',encoding='utf-8')
        a={'data-components':'auth','data-watch':'code.txt','data-candidate':'fixture-revision-1','data-environment':'synthetic'}
        a.update(attrs)
        body='<p data-criterion="A1">Result must satisfy the fixture contract.</p><p data-evidence-for="A1" data-result="pass" data-by="tester" data-date="'+date.today().isoformat()+'" data-ref="https://example.invalid/synthetic-proof" data-check="fixture assertion">Observed synthetic result.</p>'
        p=self.record(ident,attrs=a,body=body)
        self.meta(p,evidence_digest=self.bindings(ident)['evidence_digest'],status='accepted')
        return p

    def test_implicit_component_constraints_and_transitive_requirements(self):
        self.constraint(requires='security')
        self.record('W-A',attrs={'data-components':'auth'})
        self.assertEqual(self.run_cli('reindex')[0],0)
        code,out,err=self.run_cli('context','--task','W-A')
        self.assertEqual(code,0,err)
        self.assertIn('REF C-A',out)
        self.assertIn('REF security',out)
        self.assertNotIn('REF release',out)

    def test_actual_paths_include_constraints_without_component_tag(self):
        self.constraint(**{'data-applies-to':'','data-paths':'src/auth/*'})
        self.record('W-A')
        self.run_cli('reindex')
        self.assertIn('REF C-A',self.run_cli('context','--task','W-A','--paths','src/auth/service.py')[1])

    def test_broad_watch_glob_expands_to_concrete_scope(self):
        (self.root/'src/auth').mkdir(parents=True)
        (self.root/'src/auth/service.py').write_text('value=1',encoding='utf-8')
        self.constraint(**{'data-applies-to':'','data-paths':'src/auth/*'})
        self.record('W-A',attrs={'data-watch':'src/**/*.py'})
        self.run_cli('reindex')
        self.assertIn('REF C-A',self.run_cli('context','--task','W-A')[1])

    def test_dependency_cycle_rejected(self):
        self.record('D-A',attrs={'data-requires':'D-B'})
        self.record('D-B',attrs={'data-requires':'D-A'})
        self.assertIn('cycle',self.run_cli('reindex')[2])

    def test_missing_dependency_rejected(self):
        self.record('W-A',attrs={'data-requires':'missing'})
        self.assertIn('unresolved requires',self.run_cli('reindex')[2])

    def test_successor_replaces_old_rule_in_context(self):
        self.constraint('C-OLD')
        self.constraint('C-NEW',**{'data-supersedes':'C-OLD'})
        self.record('W-A',attrs={'data-components':'auth','data-requires':'C-OLD'})
        self.run_cli('reindex')
        out=self.run_cli('context','--task','W-A')[1]
        self.assertIn('REF C-NEW',out)
        self.assertNotIn('REF C-OLD',out)

    def test_archived_replacement_chain_still_resolves_current_rule(self):
        p1=self.constraint('C-ONE')
        p2=self.constraint('C-TWO',**{'data-supersedes':'C-ONE'})
        self.constraint('C-THREE',**{'data-supersedes':'C-TWO'})
        self.meta(p1,status='archived');self.meta(p2,status='archived')
        self.record('W-A',attrs={'data-requires':'C-ONE'})
        self.run_cli('reindex')
        code,out,err=self.run_cli('context','--task','W-A')
        self.assertEqual(code,0,err)
        self.assertIn('REF C-THREE',out)
        self.assertNotIn('REF C-TWO',out)

    def test_replacement_induced_dependency_cycle_rejected(self):
        self.constraint('C-ONE')
        p=self.constraint('C-TWO',**{'data-supersedes':'C-ONE'})
        self.meta(p,requires='C-ONE')
        self.assertIn('cycle',self.run_cli('reindex')[2])

    def test_guarded_replace_cannot_change_kind_to_bypass_closure(self):
        p=self.record('W-A');self.run_cli('reindex')
        candidate=self.root/'candidate.html'
        candidate.write_text(p.read_text(encoding='utf-8').replace('data-kind="work"','data-kind="guide"').replace('data-revision="1"','data-revision="2"'),encoding='utf-8')
        self.assertIn('kind is immutable',self.run_cli('replace','records/W-A.html','--from-file',str(candidate),'--expect',m.digest(p.read_bytes()))[2])

    def test_competing_successors_rejected(self):
        self.constraint('C-OLD')
        self.constraint('C-NEW',**{'data-supersedes':'C-OLD'})
        self.constraint('C-OTHER',**{'data-supersedes':'C-OLD'})
        self.assertIn('ambiguous replacement',self.run_cli('reindex')[2])

    def test_overdue_constraint_blocks_only_affected_context(self):
        p=self.constraint()
        self.meta(p,reviewed=(date.today()-timedelta(days=3)).isoformat(),review_by=(date.today()-timedelta(days=1)).isoformat())
        self.record('W-A',attrs={'data-components':'auth'})
        self.record('W-B',attrs={'data-components':'other'})
        self.run_cli('reindex')
        self.assertIn('review-overdue',self.run_cli('context','--task','W-A')[2])
        self.assertEqual(self.run_cli('context','--task','W-B')[0],0)

    def test_changed_watched_code_invalidates_rule(self):
        (self.root/'code.txt').write_text('before',encoding='utf-8')
        self.constraint(**{'data-watch':'code.txt'})
        self.record('W-A',attrs={'data-components':'auth'})
        self.run_cli('reindex')
        (self.root/'code.txt').write_text('after',encoding='utf-8')
        self.assertIn('review-stale',self.run_cli('context','--task','W-A')[2])

    def test_closure_requires_proof_not_only_status(self):
        self.record('W-A',status='accepted',attrs={'data-components':'auth'})
        self.assertIn('closure needs',self.run_cli('reindex')[2])

    def test_valid_evidence_closes_work(self):
        self.closed_work()
        self.run_cli('reindex')
        self.assertEqual(self.run_cli('context','--task','W-A')[0],0)

    def test_code_change_invalidates_closed_work(self):
        self.closed_work()
        self.run_cli('reindex')
        (self.root/'code.txt').write_text('version two',encoding='utf-8')
        self.assertIn('evidence-stale',self.run_cli('context','--task','W-A')[2])

    def test_changed_acceptance_criterion_invalidates_evidence(self):
        p=self.closed_work()
        p.write_text(p.read_text(encoding='utf-8').replace('fixture contract','new requirement'),encoding='utf-8')
        self.run_cli('reindex')
        self.assertIn('evidence-stale',self.run_cli('context','--task','W-A')[2])

    def test_missing_local_evidence_reference_is_rejected(self):
        p=self.closed_work()
        p.write_text(p.read_text(encoding='utf-8').replace('https://example.invalid/synthetic-proof','missing-proof.txt'),encoding='utf-8')
        self.assertIn('broken link',self.run_cli('reindex')[2])

    def test_failed_evidence_and_missing_deployment_rejected(self):
        p=self.closed_work()
        self.meta(p,status='released')
        self.assertIn('DEPLOYED',self.run_cli('reindex')[2])
        self.meta(p,status='accepted')
        p.write_text(p.read_text(encoding='utf-8').replace('data-result="pass"','data-result="fail"'),encoding='utf-8')
        self.assertIn('not passing',self.run_cli('reindex')[2])

    def test_context_manifest_keeps_all_requirements(self):
        self.constraint(requires='security')
        self.record('W-A',attrs={'data-components':'auth'})
        self.run_cli('reindex')
        out=self.run_cli('context','--task','W-A','--manifest')[1]
        self.assertEqual({x['id'] for x in json.loads(out)['required']},{'core','profile','W-A','C-A','security'})

    def test_growth_is_an_exception_not_silent_truncation(self):
        self.record('W-LARGE',body='<p>'+'meaningful text '*800+'</p>')
        self.run_cli('reindex')
        code,out,err=self.run_cli('health')
        self.assertEqual(code,0,err)
        self.assertIn('record-size',out)
        self.assertEqual(self.run_cli('context','--task','W-LARGE')[0],1)

    def test_active_and_archive_indexes_are_separate(self):
        self.record('W-OLD',status='archived')
        self.run_cli('reindex')
        self.assertNotIn('W-OLD', (self.root/'index.json').read_text(encoding='utf-8'))
        self.assertIn('W-OLD',(self.root/'archive-index.json').read_text(encoding='utf-8'))
        self.assertIn('W-OLD',self.run_cli('search','W-OLD','--archive')[1])

    def test_search_pagination_declares_total(self):
        for i in range(8): self.record('W-FIND-'+str(i))
        self.run_cli('reindex')
        first=self.run_cli('search','W-FIND','--limit','3')[1]
        second=self.run_cli('search','W-FIND','--limit','3','--offset','3')[1]
        self.assertIn('8 matches',first)
        self.assertNotEqual(first,second)

    def test_guarded_replace_rejects_lost_update_and_keeps_winner(self):
        p=self.record('W-A')
        self.run_cli('reindex')
        expected=m.digest(p.read_bytes())
        candidate=self.root/'candidate.html'
        candidate.write_text(p.read_text(encoding='utf-8').replace('data-revision="1"','data-revision="2"').replace('Actual scoped content','First change'),encoding='utf-8')
        self.assertEqual(self.run_cli('replace','records/W-A.html','--from-file',str(candidate),'--expect',expected)[0],0)
        self.assertIn('Revision conflict',self.run_cli('replace','records/W-A.html','--from-file',str(candidate),'--expect',expected)[2])
        self.assertIn('First change',p.read_text(encoding='utf-8'))

    def test_archived_records_cannot_be_rewritten(self):
        p=self.record('W-OLD',status='archived')
        self.run_cli('reindex')
        candidate=self.root/'candidate.html';candidate.write_text(p.read_text(encoding='utf-8').replace('data-revision="1"','data-revision="2"'),encoding='utf-8')
        self.assertIn('immutable',self.run_cli('replace','records/W-OLD.html','--from-file',str(candidate),'--expect',m.digest(p.read_bytes()))[2])

    def test_process_lock_is_released_after_process_termination(self):
        script='import sys;sys.path.insert(0,sys.argv[1]);from storage import workspace_lock;from pathlib import Path\nwith workspace_lock(Path(sys.argv[2])):\n print("locked",flush=True)\n sys.stdin.read()'
        child=subprocess.Popen([sys.executable,'-c',script,str(ROOT/'tools'),str(self.root)],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        try:
            self.assertEqual(child.stdout.readline().strip(),'locked')
            self.assertIn('Another method operation',self.run_cli('state')[2])
            child.terminate();child.communicate(timeout=10)
            self.assertEqual(self.run_cli('state')[0],0)
        finally:
            if child.poll() is None: child.kill();child.communicate()

    def test_interrupted_publication_refuses_reads_until_repaired(self):
        original=m.atomic_write
        def fail(path,text):
            if Path(path).name=='index.html': raise OSError('simulated publication failure')
            return original(path,text)
        with patch.object(m,'atomic_write',side_effect=fail):
            self.assertEqual(self.run_cli('reindex')[0],1)
        self.assertTrue((self.root/'.method-dirty').exists())
        self.assertEqual(self.run_cli('context')[0],1)
        self.assertEqual(self.run_cli('reindex')[0],0)
        self.assertEqual(self.run_cli('validate')[0],0)

    def test_timestamp_preserving_edit_is_caught_by_full_validation(self):
        p=self.root/'docs/core.html';stat=p.stat()
        p.write_bytes(p.read_bytes().replace(b'Ship small',b'Ship smart'))
        os.utime(p,ns=(stat.st_atime_ns,stat.st_mtime_ns))
        self.assertEqual(self.run_cli('read','core')[0],1)
        self.assertEqual(self.run_cli('validate')[0],1)
        self.assertEqual(self.run_cli('reindex','--full')[0],0)
        self.assertEqual(self.run_cli('validate')[0],0)

    def test_watch_paths_cannot_escape_repository(self):
        self.record('W-A',attrs={'data-watch':'../outside'})
        self.assertIn('Unsafe watched path',self.run_cli('fingerprint','W-A')[2])

    def test_global_constraint_has_stable_review_binding(self):
        self.constraint(**{'data-applies-to':'*'})
        self.run_cli('reindex')
        code,out,err=self.run_cli('context')
        self.assertEqual(code,0,err)
        self.assertIn('REF C-A',out)
        self.assertEqual(self.run_cli('validate')[0],0)

    def test_guarded_closure_checks_implicit_constraint_review(self):
        rule=self.constraint()
        self.meta(rule,reviewed=(date.today()-timedelta(days=3)).isoformat(),review_by=(date.today()-timedelta(days=1)).isoformat())
        p=self.closed_work()
        self.meta(p,status='draft')
        self.run_cli('reindex')
        candidate=self.root/'candidate.html'
        candidate.write_text(p.read_text(encoding='utf-8').replace('data-status="draft"','data-status="accepted"').replace('data-revision="1"','data-revision="2"'),encoding='utf-8')
        before=p.read_bytes()
        code,out,err=self.run_cli('replace','records/W-A.html','--from-file',str(candidate),'--expect',m.digest(before))
        self.assertEqual(code,1)
        self.assertIn('review-overdue',err)
        self.assertEqual(p.read_bytes(),before)

if __name__=='__main__': unittest.main()
