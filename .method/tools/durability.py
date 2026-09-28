"""Lifecycle, dependency selection, evidence and bounded maintenance reports."""
from datetime import date
from collections import deque
import fnmatch
import hashlib
import json
from pathlib import Path

LIMITS = {'core_chars': 2300, 'profile_chars': 2400, 'state_chars': 2400,
          'record_chars': 8000, 'active_records': 200, 'context_chars': 12000}
CLOSED = {'accepted', 'released'}
GATED = {'work', 'release', 'acceptance', 'decision', 'authorization', 'finding', 'incident'}

class DurabilityError(ValueError):
    pass

def sha(data):
    return hashlib.sha256(data).hexdigest()

def packed(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))

def words(value):
    return value.split() if value else []

def iso(value, label):
    try:
        return date.fromisoformat(value)
    except (ValueError, TypeError) as exc:
        raise DurabilityError(f'{label}: expected YYYY-MM-DD') from exc

def real(value):
    return isinstance(value, str) and bool(value.strip()) and 'TO_CONFIGURE' not in value

def metadata(page):
    m = page.meta
    return {
        'revision': int(m.get('data-revision', '1')),
        'owner': m.get('data-owner', ''),
        'reviewed': m.get('data-reviewed', ''),
        'review_by': m.get('data-review-by', ''),
        'review_trigger': m.get('data-review-trigger', ''),
        'review_digest': m.get('data-review-digest', ''),
        'requires': words(m.get('data-requires', '')),
        'supersedes': words(m.get('data-supersedes', '')),
        'components': words(m.get('data-components', '')),
        'applies_to': words(m.get('data-applies-to', '')),
        'paths': m.get('data-paths', '').split('|') if m.get('data-paths') else [],
        'watch': m.get('data-watch', '').split('|') if m.get('data-watch') else [],
        'candidate': m.get('data-candidate', ''),
        'environment': m.get('data-environment', ''),
        'evidence_digest': m.get('data-evidence-digest', ''),
        'criteria': page.criteria,
        'evidence': page.evidence,
        'body_digest': sha(page.text.encode('utf-8')),
        'has_placeholder': 'TO_CONFIGURE' in page.text,
        'links': page.links, 'anchors': sorted(page.ids),
    }

def code_root(root):
    return root.parent if root.name == '.method' else root

def watched(root, patterns):
    repo = code_root(root).resolve()
    files = {}
    for pattern in patterns:
        path = Path(pattern)
        if path.is_absolute() or '..' in path.parts or '\\' in pattern:
            raise DurabilityError(f'Unsafe watched path: {pattern}; use repository-relative forward slashes')
        found = []
        for item in repo.glob(pattern):
            if not item.is_file():
                continue
            resolved = item.resolve()
            if not resolved.is_relative_to(repo):
                raise DurabilityError(f'Watched path escapes repository: {pattern}')
            if root.name == '.method' and resolved.is_relative_to(root.resolve()):
                raise DurabilityError('Watch source/artifact files, not the .method directory itself')
            found.append(item)
            files[item.relative_to(repo).as_posix()] = sha(item.read_bytes())
        if not found:
            raise DurabilityError(f'Watched pattern has no files: {pattern}')
    return dict(sorted(files.items()))

def graph(entries):
    by_id = {e['id']: e for e in entries}
    if len({i.casefold() for i in by_id}) != len(entries):
        raise DurabilityError('Duplicate record id (case-insensitive)')
    replacements = {}
    for e in entries:
        for field in ('requires', 'supersedes'):
            for ident in e.get(field, []):
                if ident not in by_id or by_id[ident]['kind'] == 'template':
                    raise DurabilityError(f"{e['id']}: unresolved {field} reference {ident}")
        if e['status'] in CLOSED | {'archived'} or e['kind'] == 'constraint' and e['status'] == 'active':
            for ident in e.get('supersedes', []):
                if ident in replacements:
                    raise DurabilityError(f'{ident}: ambiguous replacement; resolve the competing decisions')
                if by_id[ident]['kind'] != e['kind']:
                    raise DurabilityError(f'{ident}: replacement must keep the same record kind')
                replacements[ident] = e['id']
    # Iterative traversal handles long histories without recursion limits.
    for field in ('requires', 'supersedes', 'effective-requires'):
        done = set()
        for ident in by_id:
            if ident in done:
                continue
            visiting, stack = set(), [(ident, False)]
            while stack:
                node, leaving = stack.pop()
                if leaving:
                    visiting.remove(node); done.add(node)
                elif node in visiting:
                    raise DurabilityError(f'{field} cycle involving {node}')
                elif node not in done:
                    visiting.add(node); stack.append((node, True))
                    deps = by_id[node].get(field, [])
                    if field == 'effective-requires':
                        deps = [latest(dep, replacements) for dep in by_id[node].get('requires', [])] if node not in replacements else []
                    stack.extend((dep, False) for dep in reversed(deps))
    return by_id, replacements

def latest(ident, replacements):
    seen = set()
    while ident in replacements:
        if ident in seen:
            raise DurabilityError('Replacement cycle')
        seen.add(ident); ident = replacements[ident]
    return ident

def required(entries, task=None, paths=(), seeds=(), allow_closed=False, include_constraints=True):
    by_id, replacements = graph(entries)
    ids = list(seeds)
    components = set()
    touched = list(paths)
    if task:
        e = by_id.get(task)
        if not e or e['kind'] != 'work' or e['status'] == 'archived' or e['status'] == 'released' and not allow_closed:
            raise DurabilityError('context --task requires an open work record')
        ids.append(task)
        components.update(e.get('components', []))
        touched.extend(e.get('watch', []))
    for e in entries:
        if include_constraints and e['kind'] == 'constraint' and e['status'] in {'active', 'accepted'}:
            if '*' in components or '*' in e.get('applies_to', []) or components.intersection(e.get('applies_to', [])) or any(fnmatch.fnmatchcase(p, rule) for p in touched for rule in e.get('paths', [])):
                ids.append(latest(e['id'], replacements))
    ordered, seen = [], set()
    ids = deque(ids)
    while ids:
        ident = latest(ids.popleft(), replacements)
        if ident in seen:
            continue
        seen.add(ident)
        e = by_id.get(ident)
        if not e or e['status'] == 'archived':
            raise DurabilityError(f'Required record unavailable: {ident}')
        ordered.append(ident)
        ids.extend(e.get('requires', []))
    return ordered

def binding(root, entry, entries):
    by_id, replacements = graph(entries)
    files = watched(root, entry.get('watch', []))
    deps = required(entries, task=entry['id'] if entry['kind'] == 'work' else None,
                    seeds=entry.get('requires', []), paths=list(files), allow_closed=True, include_constraints=entry['kind'] == 'work')
    deps = [i for i in deps if i != entry['id']]
    docrefs = {i: by_id[i]['sha256'] for i in deps}
    criteria = {c['id']: c['text'] for c in entry.get('criteria', [])}
    evidence = entry.get('evidence', [])
    value = {'candidate': entry.get('candidate'), 'environment': entry.get('environment'),
             'criteria': criteria, 'evidence': evidence, 'files': files, 'requires': docrefs,
             'components': entry.get('components', [])}
    return sha(packed(value).encode()), files, docrefs

def review_binding(root, entry, entries):
    by_id, _ = graph(entries)
    refs = {i: by_id[i]['sha256'] for i in required(entries, seeds=entry.get('requires', []), include_constraints=False)}
    value = {'body': entry['body_digest'], 'files': watched(root, entry.get('watch', [])),
             'requires': refs, 'applies_to': entry.get('applies_to', []), 'paths': entry.get('paths', [])}
    return sha(packed(value).encode())

def check_structure(entries):
    by_id, replacements = graph(entries)
    for e in entries:
        ident = e['id']
        if e.get('revision', 0) < 1:
            raise DurabilityError(f'{ident}: invalid revision')
        for key in ('reviewed', 'review_by'):
            if e.get(key):
                iso(e[key], f'{ident}/{key}')
        if e.get('reviewed') and e.get('review_by') and iso(e['reviewed'], ident) > iso(e['review_by'], ident):
            raise DurabilityError(f'{ident}: review-by predates the review')
        if e['kind'] == 'template' or e['status'] == 'archived':
            continue
        if e['status'] != 'draft' and not real(e.get('owner')):
            raise DurabilityError(f'{ident}: active records require an owner')
        if e['kind'] == 'constraint' and e['status'] != 'draft':
            if not e.get('applies_to') and not e.get('paths'):
                raise DurabilityError(f'{ident}: constraint needs component or path scope')
        if e['kind'] == 'work' and e['status'] not in {'draft', 'blocked'}:
            if not e.get('components') and not e.get('watch'):
                raise DurabilityError(f'{ident}: declare components or watched source scope')
        if e['kind'] in GATED and e['status'] in CLOSED:
            if e.get('has_placeholder'):
                raise DurabilityError(f'{ident}: cannot close a record with TO_CONFIGURE fields')
            if not real(e.get('candidate')) or not real(e.get('environment')):
                raise DurabilityError(f'{ident}: closure needs candidate and environment')
            criteria = e.get('criteria', [])
            if not criteria or any(not real(c['text']) for c in criteria):
                raise DurabilityError(f'{ident}: closure needs explicit acceptance criteria')
            keys = [c['id'] for c in criteria]
            if len(keys) != len(set(keys)):
                raise DurabilityError(f'{ident}: duplicate criterion id')
            proofs = e.get('evidence', [])
            for criterion in keys:
                relevant = [p for p in proofs if p['for'] == criterion]
                if not relevant:
                    raise DurabilityError(f'{ident}/{criterion}: missing evidence')
                for proof in relevant:
                    if proof.get('result') not in {'pass', 'waived'}:
                        raise DurabilityError(f'{ident}/{criterion}: required evidence is not passing')
                    for field in ('ref', 'check', 'by', 'date', 'text'):
                        if not real(proof.get(field)):
                            raise DurabilityError(f'{ident}/{criterion}: evidence missing {field}')
                    iso(proof['date'], f'{ident}/{criterion}')
                    if proof['result'] == 'waived':
                        waiver = by_id.get(proof.get('waiver'))
                        if not waiver or waiver['kind'] != 'decision' or waiver['status'] != 'accepted' or not waiver.get('review_by'):
                            raise DurabilityError(f'{ident}: waiver needs an accepted, expiring decision')
                        if proof['waiver'] not in e.get('requires', []):
                            raise DurabilityError(f'{ident}: include the waiver in data-requires')
            if any(p['for'] not in keys for p in proofs):
                raise DurabilityError(f'{ident}: evidence targets an unknown criterion')
            if not e.get('evidence_digest'):
                raise DurabilityError(f'{ident}: missing evidence binding; use fingerprint after observing checks')
        if e['status'] == 'released':
            if not any(c['id'] == 'DEPLOYED' for c in e.get('criteria', [])) or not any(p['for'] == 'DEPLOYED' and p['result'] == 'pass' for p in e.get('evidence', [])):
                raise DurabilityError(f'{ident}: released requires the DEPLOYED criterion')
    return by_id, replacements

def health(root, entries, project, at=None, selected=None):
    today = at or date.today()
    issues = []
    by_id, replacements = graph(entries)
    chosen = set(selected) if selected is not None else None
    focus = by_id.get(project.get('focus_id'))
    try:
        focus_paths = list(watched(root, focus.get('watch', []))) if focus else []
    except (DurabilityError, OSError):
        focus_paths = []
    relevant = chosen if chosen is not None else set(required(entries, task=project.get('focus_id'), paths=focus_paths, seeds=['core', project['profile_id'], *project.get('external_authorizations', []), *project.get('pending_acceptance', [])]))
    def add(level, ident, code, action):
        if level == 'error' and ident not in relevant:
            level = 'warning'
        issues.append({'level': level, 'id': ident, 'code': code, 'action': action})
    for e in entries:
        ident = e['id']
        if e['status'] == 'archived' or e['kind'] == 'template' or chosen is not None and ident not in chosen:
            continue
        if e['chars'] > LIMITS['record_chars']:
            add('warning', ident, 'record-size', 'Split this record by independently retrievable purpose.')
        if ident in replacements:
            add('warning', ident, 'superseded', f"Archive after reconciling incoming references; replacement: {latest(ident, replacements)}.")
            continue
        if e['status'] == 'draft':
            continue
        if e.get('reviewed') and iso(e['reviewed'], ident) > today:
            add('error', ident, 'future-review', 'Use the date of a review actually performed.')
        if e['kind'] in {'decision', 'constraint'}:
            if not e.get('reviewed') or not e.get('review_by') or not real(e.get('review_trigger')):
                add('error', ident, 'review-policy', 'Set review owner, reviewed date, next review date and change trigger.')
            elif iso(e['review_by'], ident) < today:
                add('error', ident, 'review-overdue', 'Owner must review applicability; do not silently reuse this rule.')
            if not e.get('review_digest'):
                add('error', ident, 'review-binding', 'Record a reviewed applicability fingerprint.')
            else:
                try:
                    if review_binding(root, e, entries) != e['review_digest']:
                        add('error', ident, 'review-stale', 'Rule, dependency or watched source changed; review applicability.')
                except (DurabilityError, OSError) as exc:
                    add('error', ident, 'review-source', str(exc))
        if e['kind'] in GATED and e['status'] in CLOSED:
            try:
                if binding(root, e, entries)[0] != e.get('evidence_digest'):
                    add('error', ident, 'evidence-stale', 'Candidate, criteria, evidence, dependency or watched source changed; re-verify affected criteria.')
            except (DurabilityError, OSError) as exc:
                add('error', ident, 'evidence-source', str(exc))
            for proof in e.get('evidence', []):
                if proof.get('date') and iso(proof['date'], ident) > today:
                    add('error', ident, 'future-evidence', 'Evidence cannot claim a future observation.')
                if proof.get('result') == 'waived':
                    waiver = by_id.get(proof.get('waiver'))
                    if waiver and iso(waiver['review_by'], waiver['id']) < today:
                        add('error', ident, 'waiver-expired', 'Renew the justified exception or pass the required check.')
    if chosen is None:
        for ident, limit in [('core', LIMITS['core_chars']), (project['profile_id'], LIMITS['profile_chars'])]:
            if ident in by_id and by_id[ident]['chars'] > limit:
                add('warning', ident, 'hot-context-size', 'Move optional detail to scoped records; preserve essential constraints.')
        if len(packed(project)) > LIMITS['state_chars']:
            add('warning', 'project', 'state-size', 'Retain active pointers; move history/details into records.')
        count = sum(e['status'] != 'archived' and e['kind'] != 'template' for e in entries)
        if count > LIMITS['active_records']:
            add('warning', 'project', 'active-count', 'Reconcile and archive closed work at the next milestone.')
    return sorted(issues, key=lambda x: (x['level'] != 'error', x['id'], x['code']))
