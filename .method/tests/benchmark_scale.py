"""Reproducible synthetic scale probe; not an application-quality benchmark."""
import argparse
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import platform
import shutil
import sys
import tempfile
import time
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('method',ROOT/'tools/method.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--records',type=int,default=5000)
    parser.add_argument('--output',type=Path)
    args=parser.parse_args()
    if args.records<100: parser.error('Use at least 100 records')
    with tempfile.TemporaryDirectory(prefix='method-scale-') as temp:
        root=Path(temp)/'kit'
        shutil.copytree(ROOT,root,ignore=shutil.ignore_patterns('__pycache__','.method-cache.json','.method.lock','.method-dirty'))
        results={}
        def run(name,*command):
            out,err=io.StringIO(),io.StringIO()
            started=time.perf_counter()
            with contextlib.redirect_stdout(out),contextlib.redirect_stderr(err):
                code=m.main(['--root',str(root),*command])
            elapsed=time.perf_counter()-started
            if code: raise RuntimeError(name+': '+err.getvalue()+out.getvalue())
            results[name]={'seconds':round(elapsed,4),'output_chars':len(out.getvalue())}
            return out.getvalue()
        before=run('baseline_context','context')
        count_active=min(50,args.records)
        for i in range(args.records):
            ident=f'SYN-{i:05d}'
            status='draft' if i<count_active else 'archived'
            body=f'<!doctype html><html lang="en"><head><title>{ident}</title></head><body><article data-method id="{ident}" data-title="{ident}" data-summary="Synthetic scale fixture" data-tags="synthetic benchmark" data-kind="work" data-status="{status}" data-owner="test" data-revision="1"><h1>{ident}</h1><p>Historical synthetic content; no real software result.</p></article></body></html>'
            (root/'records'/f'{ident}.html').write_text(body,encoding='utf-8')
        print(f'Created {args.records} synthetic records ({count_active} active, {args.records-count_active} archived).',flush=True)
        run('cold_reindex','reindex','--full')
        run('warm_reindex','reindex')
        after=run('scaled_context','context')
        assert before==after,'Archive growth leaked into model context'
        run('metadata_search','search','synthetic')
        run('archive_search','search','SYN-04999' if args.records>=5000 else f'SYN-{args.records-1:05d}','--archive')
        run('full_validate','validate')
        run('health','health')
        assert len(m.Page((root/'archive.html').read_text(encoding='utf-8'),'archive').links)<=110
        report={'schema_version':1,'method_version':m.VERSION,'platform':platform.platform(),
                'python':platform.python_version(),'synthetic_records':args.records,
                'synthetic_active':count_active,'synthetic_archived':args.records-count_active,
                'context_identical_after_growth':before==after,'results':results,
                'limits':'Single local synthetic run. Character counts are not billed tokens. No proof of years of operation or application correctness.'}
        text=json.dumps(report,ensure_ascii=False,indent=2)+'\n'
        if args.output:
            args.output.parent.mkdir(parents=True,exist_ok=True)
            args.output.write_text(text,encoding='utf-8')
        print(text)
if __name__=='__main__': main()
