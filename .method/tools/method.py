#!/usr/bin/env python3
"""METHOD V6: offline HTML retrieval and deterministic views; Python 3.10+, stdlib only."""
from __future__ import annotations
import argparse
import os
from types import SimpleNamespace
import hashlib
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sys
import unicodedata
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent))
import durability as d
from storage import workspace_lock, atomic_write
VERSION = '6.1.0'
VOID = set('area base br col embed hr img input link meta param source track wbr'.split())
BLOCK = set('article section h1 h2 h3 h4 p li ul ol dl dt dd pre table tr div blockquote'.split())
STATES = {'draft', 'ready', 'active', 'blocked', 'review', 'accepted', 'released', 'archived'}

class MethodError(Exception):
    pass

def digest(data):
    return hashlib.sha256(data).hexdigest()

def encode(data):
    return json.dumps(data, ensure_ascii=False, indent=2) + '\n'

def safe_path(root, relative):
    path = (root / relative).resolve()
    if not path.is_relative_to(root.resolve()):
        raise MethodError(f'Path outside method root: {relative}')
    return path

class Page(HTMLParser):
    """Parse balanced semantic HTML; keep article text and link destinations."""
    def __init__(self, raw, label):
        super().__init__(convert_charrefs=True)
        self.label, self.stack, self.ids, self.links = label, [], set(), []
        self.meta, self.parts, self.active, self.pre, self.hidden = None, [], False, 0, 0
        self.criteria, self.evidence, self.capture = [], [], []
        self.feed(raw)
        self.close()
        if self.stack:
            raise MethodError(f'{label}: unclosed {self.stack[-1]}')
        self.text = re.sub(r'\n[ \t]*\n(?:[ \t]*\n)+', '\n\n', ''.join(self.parts)).strip()

    def handle_starttag(self, tag, pairs):
        attrs = dict(pairs)
        if ('data-criterion' in attrs or 'data-evidence-for' in attrs) and tag not in {'p', 'li'}:
            raise MethodError('Criteria and evidence must use visible p/li elements')
        if 'data-criterion' in attrs and self.active and not self.hidden:
            item = {'id': attrs['data-criterion'], 'text': ''}
            self.criteria.append(item)
            self.capture.append((len(self.stack), item))
        if 'data-evidence-for' in attrs and self.active and not self.hidden:
            item = {key: attrs.get('data-' + key, '') for key in ('result', 'ref', 'check', 'by', 'date', 'waiver')}
            item.update({'for': attrs['data-evidence-for'], 'text': ''})
            self.evidence.append(item)
            self.capture.append((len(self.stack), item))
        if tag not in VOID:
            self.stack.append(tag)
        ident = attrs.get('id')
        if ident:
            if ident in self.ids:
                raise MethodError(f'{self.label}: duplicate anchor {ident}')
            self.ids.add(ident)
        if tag == 'article' and 'data-method' in attrs:
            if self.meta is not None:
                raise MethodError(f'{self.label}: one indexed article per file required')
            self.meta, self.active = attrs, True
        if tag in {'script', 'style', 'template'}:
            self.hidden += 1
        if tag == 'pre':
            self.pre += 1
        if self.active and not self.hidden:
            if tag in BLOCK or tag == 'br':
                self.parts.append('\n')
            if tag == 'li':
                self.parts.append('- ')
            if tag in {'td', 'th'}:
                self.parts.append(' | ')
        for key in ('href', 'src', 'data-ref'):
            if attrs.get(key):
                self.links.append(attrs[key])
        if self.active and tag == 'a':
            self.link_target = attrs.get('href', '')

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if not self.stack or self.stack[-1] != tag:
            raise MethodError(f'{self.label}: unbalanced closing tag {tag}')
        if self.active and not self.hidden:
            if tag == 'a' and getattr(self, 'link_target', ''):
                self.parts.append(f' [{self.link_target}]')
            if tag in BLOCK:
                self.parts.append('\n')
        if tag == 'article':
            self.active = False
        if tag in {'script', 'style', 'template'}:
            self.hidden -= 1
        if tag == 'pre':
            self.pre -= 1
        self.stack.pop()
        self.capture = [(depth, item) for depth, item in self.capture if depth < len(self.stack)]

    def handle_data(self, data):
        for _, item in self.capture:
            item['text'] = (item['text'] + ' ' + data.strip()).strip()
        if self.active and not self.hidden:
            self.parts.append(data if self.pre else re.sub(r'\s+', ' ', data))

def source_inventory(root):
    """Use cached directory stats; resolve reparse points before following them."""
    root = root.resolve()
    files = []
    start = root / 'START.html'
    if start.exists():
        safe_path(root, 'START.html')
        files.append((start, start.stat()))
    pending = [root / name for name in ('docs', 'work', 'records', 'templates') if (root / name).exists()]
    seen = set()
    while pending:
        folder = pending.pop()
        resolved = folder.resolve()
        if not resolved.is_relative_to(root):
            raise MethodError(f'Path outside method root: {folder}')
        if resolved in seen:
            continue
        seen.add(resolved)
        with os.scandir(folder) as children:
            for child in children:
                stat = child.stat(follow_symlinks=False)
                reparse = child.is_symlink() or getattr(stat, 'st_file_attributes', 0) & 0x400
                if reparse:
                    safe_path(root, Path(child.path).relative_to(root))
                if child.is_dir():
                    pending.append(Path(child.path))
                elif child.name.lower().endswith('.html') and child.is_file():
                    files.append((Path(child.path), child.stat() if reparse else stat))
    yield from sorted(files, key=lambda pair: pair[0])


def sources(root):
    return (path for path, _ in source_inventory(root))


def scan(root, incremental=False, overrides=None):
    entries, pages, seen = [], {}, set()
    overrides = overrides or {}
    cache = {}
    if incremental:
        try:
            cache = json.loads((root / '.method-cache.json').read_text(encoding='utf-8'))
        except (OSError, ValueError):
            pass
    updated_cache = {}
    for path, stat in source_inventory(root):
        rel = path.relative_to(root).as_posix()
        signature = [stat.st_size, stat.st_mtime_ns]
        old = cache.get(rel)
        if old and old.get('signature') == signature and rel not in overrides:
            entry = old['entry']
            if entry['id'].casefold() in seen:
                raise MethodError(f"Duplicate record id: {entry['id']}")
            seen.add(entry['id'].casefold())
            entries.append(entry)
            pages[rel] = SimpleNamespace(links=entry['links'], ids=set(entry['anchors']), text='TO_CONFIGURE' if entry['has_placeholder'] else '')
            updated_cache[rel] = old
            continue
        raw = overrides.get(rel, path.read_bytes())
        page = Page(raw.decode('utf-8'), rel)
        if page.meta is None:
            raise MethodError(f'{rel}: missing article data-method')
        m = page.meta
        required = ('id', 'data-title', 'data-summary', 'data-tags', 'data-kind', 'data-status')
        if any(not m.get(key) for key in required):
            raise MethodError(f'{rel}: incomplete article metadata')
        if not re.fullmatch(r'[A-Za-z][A-Za-z0-9_-]*', m['id']):
            raise MethodError(f'{rel}: invalid record id')
        if m['data-kind'] not in {'entry', 'guide', 'project', 'template', 'work', 'decision', 'finding', 'acceptance', 'release', 'authorization', 'incident', 'constraint'}:
            raise MethodError(f'{rel}: invalid record kind')
        if m['data-status'] not in STATES:
            raise MethodError(f'{rel}: invalid status')
        if m['id'].casefold() in seen:
            raise MethodError(f"Duplicate record id: {m['id']}")
        seen.add(m['id'].casefold())
        entry = dict(id=m['id'], path=rel, title=m['data-title'],
                            summary=m['data-summary'], tags=m['data-tags'].split(),
                            kind=m['data-kind'], status=m['data-status'],
                            sha256=digest(raw), chars=len(page.text), size=stat.st_size, mtime_ns=stat.st_mtime_ns, **d.metadata(page))
        entries.append(entry)
        pages[rel] = page
        updated_cache[rel] = {'signature': signature, 'entry': entry}
    if incremental and not overrides:
        atomic_write(root / '.method-cache.json', encode(updated_cache))
    return entries, pages

def project(root, content=None):
    p = json.loads(content if content is not None else (root / 'project.json').read_text(encoding='utf-8'))
    required = {'schema_version', 'method_version', 'template', 'name', 'revision', 'updated_at',
                'mode', 'po', 'cto', 'focus_id', 'next_action', 'profile_id', 'roadmap_id',
                'blocked_on', 'pending_acceptance', 'external_authorizations'}
    if not isinstance(p, dict) or not required.issubset(p):
        raise MethodError('project.json: missing required fields')
    if p['schema_version'] != 1 or p['mode'] not in {'direct', 'cto'}:
        raise MethodError('project.json: unsupported schema or mode')
    if type(p['template']) is not bool or type(p['revision']) is not int or p['revision'] < 1:
        raise MethodError('project.json: invalid template flag or revision')
    from datetime import date
    date.fromisoformat(p['updated_at'])
    for field in ('name', 'method_version', 'po', 'cto', 'next_action', 'profile_id', 'roadmap_id'):
        if not isinstance(p[field], str) or not p[field].strip():
            raise MethodError(f'project.json: invalid {field}')
    if p['focus_id'] is not None and not isinstance(p['focus_id'], str):
        raise MethodError('project.json: focus_id must be an id or null')
    for field in ('blocked_on', 'pending_acceptance', 'external_authorizations'):
        if not isinstance(p[field], list) or any(not isinstance(x, str) for x in p[field]):
            raise MethodError(f'project.json: {field} must contain record ids')
    return p

def state_text(p):
    return encode(p).strip()

def index_content(entries):
    return encode({'schema_version': 2, 'generated': True, 'entries': entries})

def render(root, entries, p, part=0, archive=False, fingerprint=None):
    esc = html.escape
    cards = []
    visible = [e for e in entries if (e['status'] == 'archived') == archive]
    for e in visible[part * 100:(part + 1) * 100]:
        search = esc(' '.join([e['id'], e['title'], e['summary'], *e['tags']]), quote=True)
        cards.append(f'<div class="card" data-search="{search}"><h3><a href="{esc(e["path"])}#{e["id"]}">{esc(e["title"])}</a></h3><p>{esc(e["summary"])}</p><span class="meta">{e["id"]} · {e["kind"]} · {e["status"]} · {e["chars"]:,} characters</span></div>')
    fingerprint = fingerprint or digest((index_content(entries) + encode(p)).encode('utf-8'))
    stem = 'archive' if archive else 'index'
    previous = f'<a href="{stem}{"" if part == 1 else "-" + str(part)}.html">Previous</a>' if part else ''
    following = f'<a href="{stem}-{part + 2}.html">Next</a>' if (part + 1) * 100 < len(visible) else ''
    navigation = f'<p>{len(visible)} records · Page {part + 1} · {previous} {following} · <a href="{"index" if archive else "archive"}.html">{"Active records" if archive else "History"}</a></p>'
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="method-fingerprint" content="{fingerprint}"><title>METHOD V6 — Project operating method</title><link rel="stylesheet" href="assets/method.css"><script src="assets/index.js" defer></script></head>
<body><header><a class="brand" href="index.html">METHOD / V6</a><a href="docs/adoption.html#adoption">Adopt the method</a></header><main>
<p class="eyebrow">Production software · Focused context</p><h1>Keep the project.<br>Load only what matters.</h1><p class="lede">English working instructions. French communication with Guillaume and user-facing deliverables. English coordination with Robertson.</p>
<div class="note"><strong>{esc(p['name'])}</strong> · {'Template — not configured for production' if p['template'] else esc(p['mode'])} · Revision {p['revision']} · {esc(p['updated_at'])}<br>{esc(p['next_action'])}<br><a href="project.json">Canonical project state</a> · <a href="START.html#start">Start a Codex task</a></div>
<h2>Find the next useful reference</h2>{navigation}<label for="search">Filter this page by title, summary or keyword</label><input id="search" type="search" placeholder="Try: security, CTO, release, acceptance…"><p id="results" role="status" aria-live="polite">{len(cards)} references</p><div class="grid">{''.join(cards)}</div>
<h2>Current state · generated view</h2><pre><code>{esc(state_text(p))}</code></pre><p>Edit HTML sources and project.json, then run <code>python tools/method.py reindex</code> from this folder. This page is regenerated; do not edit it by hand. No external service or network request is needed.</p></main><footer>METHOD {VERSION} · Selective retrieval, explicit acceptance, reproducible evidence.</footer></body></html>
'''

def check_links(root, pages):
    cache = dict(pages)
    for rel, page in pages.items():
        for link in page.links:
            u = urlsplit(link)
            if u.scheme or u.netloc:
                if u.scheme not in {'https', 'http', 'mailto'}:
                    raise MethodError(f'{rel}: unsupported URL scheme in {link}')
                continue
            target = (root / Path(rel).parent / unquote(u.path)).resolve() if u.path else root / rel
            if not target.is_relative_to(d.code_root(root).resolve()):
                raise MethodError(f'{rel}: link outside project {link}')
            if not target.is_file() and os.path.relpath(target, root).replace('\\', '/') not in cache:
                raise MethodError(f'{rel}: broken link {link}')
            if u.fragment:
                target_rel = os.path.relpath(target, root).replace('\\', '/')
                if target.suffix != '.html':
                    raise MethodError(f'{rel}: fragment on non-HTML file {link}')
                if target_rel not in cache:
                    cache[target_rel] = Page(target.read_text(encoding='utf-8'), target_rel)
                if unquote(u.fragment) not in cache[target_rel].ids:
                    raise MethodError(f'{rel}: missing anchor {link}')

def check_state(p, entries, ready=False):
    by_id = {e['id']: e for e in entries}
    refs = [p['profile_id'], p['roadmap_id'], *p['blocked_on'], *p['pending_acceptance'], *p['external_authorizations']]
    if p['focus_id']:
        refs.append(p['focus_id'])
    for ref in refs:
        if ref not in by_id or by_id[ref]['kind'] == 'template' or by_id[ref]['status'] == 'archived':
            raise MethodError(f'project.json: unresolved active record {ref}')
    if p['focus_id'] and by_id[p['focus_id']]['kind'] != 'work':
        raise MethodError('project.json: focus_id must reference work')
    for ref in p['external_authorizations']:
        if by_id[ref]['kind'] != 'authorization' or by_id[ref]['status'] != 'accepted':
            raise MethodError('project.json: external_authorizations needs accepted authorization records')
    for ref in p['pending_acceptance']:
        if by_id[ref]['kind'] != 'acceptance' or by_id[ref]['status'] in {'accepted', 'released', 'archived'}:
            raise MethodError('project.json: pending_acceptance needs open acceptance records')
    if p['focus_id'] and by_id[p['focus_id']]['status'] in {'released', 'archived'}:
        raise MethodError('project.json: focus points to closed history')
    if ready:
        if p['template'] or not p['focus_id']:
            raise MethodError('Project not configured: set template=false and a real focus_id')
        for ref in (p['profile_id'], p['roadmap_id'], p['focus_id']):
            if by_id[ref]['status'] == 'draft':
                raise MethodError(f'Project record still draft: {ref}')

def load_index(root, fresh=False):
    if (root / '.method-dirty').exists():
        raise MethodError('Index stale: interrupted publication; run reindex to recover')
    entries = []
    for name in ('index.json', 'archive-index.json'):
        data = json.loads((root / name).read_text(encoding='utf-8'))
        if data.get('schema_version') != 2:
            raise MethodError('Unsupported index version; run reindex')
        entries.extend(data['entries'])
    if fresh:
        actual = {p.relative_to(root).as_posix(): [st.st_size, st.st_mtime_ns] for p, st in source_inventory(root)}
        stored = {e['path']: [e['size'], e['mtime_ns']] for e in entries}
        if actual != stored:
            raise MethodError('Index stale (added, changed or removed HTML); run reindex')
    return entries

def read_record(root, entries, ident):
    matches = [e for e in entries if e['id'] == ident]
    if len(matches) != 1:
        raise MethodError(f'Unknown record: {ident}; search or reindex first')
    e = matches[0]
    raw = safe_path(root, e['path']).read_bytes()
    if digest(raw) != e['sha256']:
        raise MethodError(f'{ident}: stale index; run reindex --full')
    page = Page(raw.decode('utf-8'), e['path'])
    return f"REF {e['id']} | {e['kind']} | {e['status']} | {e['path']}#{e['id']} | sha256:{e['sha256']}\n{page.text}"

def norm(text):
    return ''.join(c for c in unicodedata.normalize('NFKD', text.lower()) if not unicodedata.combining(c))

def search(root, entries, query, limit, include_archive=False, full_text=False, offset=0):
    terms = re.findall(r'[\w-]+', norm(query))
    if not terms:
        raise MethodError('Provide at least one search term')
    scored = []
    for e in entries:
        if e['status'] == 'archived' and not include_archive:
            continue
        header = norm(' '.join([e['id'], e['title'], *e['tags']]))
        summary = norm(e['summary'])
        score = sum(4 * (t in header) + (t in summary) for t in terms)
        if full_text:
            body = norm(read_record(root, entries, e['id']))
            score += sum(t in body for t in terms)
        if score:
            scored.append((score, e))
    scored.sort(key=lambda item: (-item[0], item[1]['id']))
    lines = [f"{e['id']} | {e['path']}#{e['id']} | {e['chars']} chars\n  {e['summary']}" for _, e in scored[offset:offset + limit]]
    if scored and not lines:
        return f'{len(scored)} matches; no results at offset {offset}. Use a smaller --offset.'
    return (f'{len(scored)} matches; showing {offset + 1}-{min(offset + limit, len(scored))}. Use --offset for more.\n' + '\n'.join(lines)) if lines else 'No match. Try synonyms or search --full-text. No document body was returned.'

def emit(text, max_chars):
    if len(text) > max_chars:
        raise MethodError(f'Output has {len(text)} characters; budget is {max_chars}. Read fewer records or explicitly raise --max-chars. Nothing was truncated.')
    print(text)


def create_record(root, kind, ident, title, summary):
    templates = {'work': 'work', 'decision': 'decision', 'finding': 'finding',
                 'acceptance': 'acceptance', 'release': 'release',
                 'authorization': 'authorization', 'incident': 'incident', 'constraint': 'constraint'}
    if kind not in templates or not re.fullmatch(r'[A-Za-z][A-Za-z0-9_-]*', ident):
        raise MethodError('Invalid record kind or id')
    entries, _ = scan(root, incremental=True)
    if any(e['id'].lower() == ident.lower() for e in entries):
        raise MethodError(f'Record id already exists: {ident}')
    if not title.strip() or not summary.strip():
        raise MethodError('Title and summary cannot be empty')
    source = root / 'templates' / (templates[kind] + '.html')
    raw = source.read_text(encoding='utf-8')
    old = 'tpl-' + templates[kind]
    raw = raw.replace(f'id="{old}"', f'id="{ident}"')
    raw = raw.replace('data-kind="template"', f'data-kind="{kind}"')
    for attr, value in (('data-title', title), ('data-summary', summary)):
        raw = re.sub(attr + r'="[^"]*"', lambda m: attr + '="' + html.escape(value, quote=True) + '"', raw, count=1)
    raw = re.sub(r'<title>.*?</title>', lambda m: '<title>' + html.escape(title) + ' · METHOD V6</title>', raw, count=1)
    raw = re.sub(r'<h1>.*?</h1>', lambda m: '<h1>' + html.escape(title) + '</h1>', raw, count=1)
    raw = re.sub(r'<p class="eyebrow">.*?</p>', lambda m: f'<p class="eyebrow">{kind} / {ident}</p>', raw, count=1)
    raw = raw.replace(f'template · {old}', f'{kind} · {ident}')
    raw = re.sub(r'<p class="note">.*?</p>', '<p class="note">Draft. Replace TO_CONFIGURE fields, remove unused fields and record actual evidence before acceptance.</p>', raw, count=1)
    raw = re.sub(r'<p>Copy to .*?</p>', '', raw, count=1)
    raw = re.sub(r'href="([a-z-]+\.html#tpl-[^"]+)"', r'href="../templates/\1"', raw)
    folder = 'work' if kind == 'work' else 'records'
    destination = safe_path(root, f'{folder}/{ident}.html')
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open('x', encoding='utf-8', newline='\n') as stream:
        stream.write(raw)
    return destination.relative_to(root).as_posix()


def generated_views(root, entries, p):
    views = {}
    fingerprint = digest((index_content(entries) + encode(p)).encode('utf-8'))
    for archive in (False, True):
        count = sum((e['status'] == 'archived') == archive for e in entries)
        stem = 'archive' if archive else 'index'
        for part in range(max(1, (count + 99) // 100)):
            name = stem + ('' if part == 0 else '-' + str(part + 1)) + '.html'
            views[name] = render(root, entries, p, part, archive, fingerprint)
    return views

def verify_and_publish(root, write=False, ready=False, full=False):
    if write and full and (root / '.method-cache.json').exists():
        (root / '.method-cache.json').unlink()
    entries, pages = scan(root, incremental=write)
    p = project(root)
    check_state(p, entries, ready)
    d.check_structure(entries)
    if ready:
        by_id = {e['id']: e for e in entries}
        for ident in (p['profile_id'], p['roadmap_id'], p['focus_id']):
            if by_id[ident]['has_placeholder']:
                raise MethodError(f'Unfilled project record: {ident}')
    views = generated_views(root, entries, p)
    pages.update({name: Page(view, name) for name, view in views.items()})
    check_links(root, pages)
    payloads = {
        'index.json': index_content([e for e in entries if e['status'] != 'archived']),
        'archive-index.json': index_content([e for e in entries if e['status'] == 'archived']),
        **views,
    }
    if write:
        atomic_write(root / '.method-dirty', 'Publication in progress; recover with reindex.\n')
        for name, value in payloads.items():
            atomic_write(root / name, value)
        # Remove only obsolete generated page names inside the verified method root.
        for pattern in ('index-*.html', 'archive-*.html'):
            for path in root.glob(pattern):
                if re.fullmatch(r'(index|archive)-[0-9]+\.html', path.name) and path.name not in views:
                    safe_path(root, path.name).unlink()
        (root / '.method-dirty').unlink()
    else:
        if (root / '.method-dirty').exists():
            raise MethodError('Interrupted publication; run reindex')
        for name, value in payloads.items():
            if (root / name).read_text(encoding='utf-8') != value:
                raise MethodError('Generated index/view stale; run reindex')
        errors = [i for i in d.health(root, entries, p) if i['level'] == 'error']
        if errors:
            raise MethodError('Lifecycle errors: ' + '; '.join(i['id'] + '/' + i['code'] for i in errors[:10]) + '. Run health for actions.')
    return entries

def replacement(root, relative, content, expected):
    path = safe_path(root, relative)
    allowed = {p.relative_to(root).as_posix() for p in sources(root)} | {'project.json'}
    if relative not in allowed:
        raise MethodError('replace accepts existing canonical HTML or project.json only')
    current = path.read_bytes()
    if not re.fullmatch('[0-9a-f]{64}', expected) or digest(current) != expected:
        raise MethodError('Revision conflict: source changed since it was read. Re-read and merge; do not reuse the old replacement.')
    if relative == 'project.json':
        old, candidate = project(root), project(root, content)
        if candidate['revision'] != old['revision'] + 1:
            raise MethodError('project.json revision must increase by exactly one')
        entries, pages = scan(root)
        check_state(candidate, entries)
    else:
        old = Page(current.decode('utf-8'), relative)
        candidate_page = Page(content, relative)
        if not candidate_page.meta or candidate_page.meta.get('id') != old.meta.get('id'):
            raise MethodError('A record id is immutable; create a successor record')
        if candidate_page.meta.get('data-kind') != old.meta.get('data-kind'):
            raise MethodError('A record kind is immutable; create a new record')
        if old.meta['data-status'] == 'draft' and candidate_page.meta['data-status'] == 'archived' and candidate_page.meta.get('data-supersedes'):
            raise MethodError('An unapproved proposal cannot establish replacement lineage when archived')
        if old.meta['data-status'] == 'archived':
            raise MethodError('Archived history is immutable; create a successor record')
        if int(candidate_page.meta.get('data-revision', '1')) != int(old.meta.get('data-revision', '1')) + 1:
            raise MethodError('Record data-revision must increase by exactly one')
        entries, pages = scan(root, overrides={relative: content.encode('utf-8')})
        d.check_structure(entries)
        check_state(project(root), entries)
        check_links(root, pages)
        ident = candidate_page.meta['id']
        entry = next(e for e in entries if e['id'] == ident)
        if entry['status'] in d.CLOSED or entry['kind'] == 'constraint' and entry['status'] == 'active':
            ids = d.required(entries, task=ident if entry['kind'] == 'work' else None, paths=list(d.watched(root, entry.get('watch', []))), seeds=[ident], allow_closed=True)
            errors = [i for i in d.health(root, entries, project(root), selected=ids) if i['level'] == 'error']
            if errors:
                raise MethodError('Closure/review blocked: ' + '; '.join(i['id'] + '/' + i['code'] for i in errors))
    # Readers/writers share an OS lock; source replacement is atomic. An interrupted
    # multi-view publication stays explicitly dirty until reindex repairs it.
    atomic_write(root / '.method-dirty', 'Source updated; run reindex to recover publication.\n')
    atomic_write(path, content)
    verify_and_publish(root, write=True)


def main(argv=None):
    pre = argparse.ArgumentParser(add_help=False)
    pre.add_argument('--root', type=Path, default=ROOT)
    opts, _ = pre.parse_known_args(argv)
    try:
        with workspace_lock(opts.root.resolve()):
            return _main(argv)
    except (OSError, RuntimeError, ValueError) as exc:
        print(f'ERROR: {exc}', file=sys.stderr)
        return 1

def _main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=ROOT)
    commands = parser.add_subparsers(dest='command', required=True)
    new = commands.add_parser('new', help='Create one draft HTML record; never overwrite')
    new.add_argument('kind', choices=['work', 'decision', 'finding', 'acceptance', 'release', 'authorization', 'incident', 'constraint'])
    new.add_argument('id')
    new.add_argument('--title', required=True)
    new.add_argument('--summary', required=True)
    reindex = commands.add_parser('reindex', help='Regenerate indexes and views from canonical sources')
    reindex.add_argument('--full', action='store_true', help='Discard local cache and reparse every source')
    validate = commands.add_parser('validate', help='Check HTML, links, state and generated views')
    validate.add_argument('--project-ready', action='store_true', help='Check adoption fields, not software release readiness')
    health = commands.add_parser('health', help='Exceptions only: lifecycle, evidence, review and growth')
    health.add_argument('--at', help='YYYY-MM-DD; deterministic audit date')
    health.add_argument('--limit', type=int, default=30)
    health.add_argument('--offset', type=int, default=0)
    fp = commands.add_parser('fingerprint', help='Current bindings; records no approval or test result')
    fp.add_argument('id')
    fp.add_argument('--from-file', type=Path, help='Evaluate a proposed record before a guarded replacement')
    change = commands.add_parser('replace', help='Atomic compare-and-swap of a canonical source, then reindex')
    change.add_argument('path')
    change.add_argument('--from-file', type=Path, required=True)
    change.add_argument('--expect', required=True, help='Full SHA-256 from the source originally read')
    for cmd in ('read', 'context', 'state'):
        sub = commands.add_parser(cmd)
        sub.add_argument('--max-chars', type=int, default=12000)
        if cmd == 'read':
            sub.add_argument('ids', nargs='+')
        if cmd == 'context':
            sub.add_argument('--task', help='Real work record id; defaults to project focus_id')
            sub.add_argument('--paths', nargs='*', default=[], help='Actual changed repository-relative paths')
            sub.add_argument('--manifest', action='store_true', help='List every required reference without bodies')
    sub = commands.add_parser('search')
    sub.add_argument('query')
    sub.add_argument('--limit', type=int, default=5)
    sub.add_argument('--offset', type=int, default=0)
    sub.add_argument('--archive', action='store_true')
    sub.add_argument('--full-text', action='store_true')
    sub.add_argument('--max-chars', type=int, default=5000)
    sub = commands.add_parser('metrics', help='Reproducible character counts; not a token billing estimate')
    sub.add_argument('--baseline', type=Path, help='V5 directory for the historical mandatory method pair')
    args = parser.parse_args(argv)
    root = args.root.resolve()
    try:
        if args.command == 'new':
            path = create_record(root, args.kind, args.id, args.title, args.summary)
            print(f'Created draft: {path}. Fill it, then run reindex.')
        elif args.command in {'reindex', 'validate'}:
            entries = verify_and_publish(root, write=args.command == 'reindex', ready=getattr(args, 'project_ready', False), full=getattr(args, 'full', False))
            print(f'OK: {len(entries)} HTML records; links, dependencies, lifecycle structure and generated views verified. Software tests are separate.')
        elif args.command == 'replace':
            replacement(root, args.path, args.from_file.read_text(encoding='utf-8-sig'), args.expect)
            print(f'Updated {args.path}; revision checked and views published.')
        elif args.command == 'fingerprint':
            overrides = None
            if args.from_file:
                indexed = load_index(root)
                e = next((e for e in indexed if e['id'] == args.id), None)
                if not e:
                    raise MethodError('Unknown record')
                overrides = {e['path']: args.from_file.read_bytes()}
            entries, _ = scan(root, overrides=overrides)
            e = next((e for e in entries if e['id'] == args.id), None)
            if not e:
                raise MethodError('Unknown record')
            evidence, files, refs = d.binding(root, e, entries)
            emit(encode({'id': e['id'], 'source_sha256': e['sha256'],
                         'evidence_digest': evidence, 'review_digest': d.review_binding(root, e, entries),
                         'watched_files': files, 'required_refs': refs,
                         'meaning': 'Computed bindings only; no test run or approval is asserted.'}), 12000)
        elif args.command == 'health':
            entries, _ = scan(root)
            d.check_structure(entries)
            issues = d.health(root, entries, project(root), d.iso(args.at, '--at') if args.at else None)
            if not 1 <= args.limit <= 100 or args.offset < 0:
                raise MethodError('Use a limit from 1 to 100 and a nonnegative offset')
            emit(encode({'total': len(issues), 'offset': args.offset,
                         'issues': issues[args.offset:args.offset + args.limit]}), 20000)
            return 1 if any(i['level'] == 'error' for i in issues) else 0
        elif args.command == 'state':
            emit('REF project.json | sha256:' + digest((root / 'project.json').read_bytes()) + '\n' + state_text(project(root)), args.max_chars)
        else:
            entries = load_index(root, fresh=args.command in {'search', 'context', 'metrics'})
            if args.command == 'read':
                emit('\n\n'.join(read_record(root, entries, i) for i in dict.fromkeys(args.ids)), args.max_chars)
            elif args.command == 'search':
                if not 1 <= args.limit <= 20 or args.offset < 0:
                    raise MethodError('--limit must be between 1 and 20')
                emit(search(root, entries, args.query, args.limit, args.archive, args.full_text, args.offset), args.max_chars)
            elif args.command == 'context':
                p = project(root)
                check_state(p, entries)
                ident = args.task or p['focus_id']
                task_entry = next((e for e in entries if e['id'] == ident), None)
                touched = list(args.paths) + list(d.watched(root, task_entry.get('watch', [])) if task_entry else {})
                ids = d.required(entries, task=ident, paths=touched, seeds=['core', p['profile_id']])
                by_id = {e['id']: e for e in entries}
                if args.manifest:
                    emit(encode({'required': [{'id': i, 'path': by_id[i]['path'], 'chars': by_id[i]['chars'], 'sha256': by_id[i]['sha256']} for i in ids], 'instruction': 'Read all required records before acting; no optional hyperlink expansion.'}), args.max_chars)
                else:
                    errors = [i for i in d.health(root, entries, p, selected=ids) if i['level'] == 'error']
                    if errors:
                        raise MethodError('Required context needs review: ' + '; '.join(i['id'] + '/' + i['code'] for i in errors) + '. Use context --manifest and health; continue unrelated work.')
                    text = '\n\n'.join([state_text(p), *(read_record(root, entries, i) for i in ids)])
                    emit(text, args.max_chars)
            elif args.command == 'metrics':
                p = project(root)
                text = '\n\n'.join([state_text(p), read_record(root, entries, 'core'), read_record(root, entries, p['profile_id'])])
                data = {'unit': 'Unicode characters, not tokens', 'html_records': len(entries),
                        'all_extracted_chars': sum(e['chars'] for e in entries), 'bootstrap_chars_without_task': len(text),
                        'bootstrap_includes': ['project.json', 'core', p['profile_id']],
                        'task_and_optional_modules': 'excluded; vary by project',
                        'html_entrypoint_raw_chars': len((root / 'START.html').read_text(encoding='utf-8')),
                        'initial_context_with_html_entrypoint_chars': len(text) + len((root / 'START.html').read_text(encoding='utf-8'))}
                if args.baseline:
                    files = [args.baseline / 'METHOD-TEMPLATE.md', args.baseline / 'METHOD-TEMPLATE.json']
                    baseline = sum(len(f.read_text(encoding='utf-8-sig')) for f in files)
                    data.update(v5_mandatory_method_pair_chars=baseline,
                                reduction_vs_v5_pair_percent=round(100 * (1 - len(text) / baseline), 1),
                                reduction_including_entrypoint_percent=round(100 * (1 - data['initial_context_with_html_entrypoint_chars'] / baseline), 1),
                                baseline_scope='V5 full method MD+JSON only; excludes missing project state and plans')
                print(encode(data), end='')
        return 0
    except (MethodError, OSError, ValueError, KeyError, TypeError) as exc:
        print(f'ERROR: {exc}', file=sys.stderr)
        return 1

if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    sys.exit(main())
