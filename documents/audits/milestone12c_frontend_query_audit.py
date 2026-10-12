"""Run: python audits/milestone12c_frontend_query_audit.py
Conservative source audit; not a substitute for network-tab or RLS testing.
"""
from pathlib import Path
import re
ROOT = Path(__file__).resolve().parents[1] / 'src'
issues, storage, realtime, auth, edge = [], [], [], [], []
for file in sorted(ROOT.rglob('*')):
    if file.suffix not in ('.js', '.jsx', '.ts', '.tsx'):
        continue
    content = file.read_text(encoding='utf-8')
    lines = content.splitlines()
    for n, line in enumerate(lines, 1):
        # Covers the chained `await supabase.storage\n .from(...)` style.
        if re.search(r'\.from\s*\(', line) and not re.search(r'\bArray\.from\s*\(', line):
            preceding = '\n'.join(lines[max(0, n-11):n])
            if re.search(r'supabase\.storage\s*(?:\n\s*)?\.from\s*\(', preceding):
                storage.append((file.relative_to(ROOT), n))
            else:
                issues.append((file.relative_to(ROOT), n, 'non-Storage .from()'))
        if re.search(r'\b(?:supabase|db)\.rpc\s*\(', line) or '/rest/v1/' in line:
            issues.append((file.relative_to(ROOT), n, 'direct RPC/REST'))
        if 'supabase.channel(' in line or 'supabase.removeChannel(' in line:
            realtime.append((file.relative_to(ROOT), n))
        if 'supabase.auth.' in line:
            auth.append((file.relative_to(ROOT), n))
        if 'supabase.functions.invoke(' in line:
            edge.append((file.relative_to(ROOT), n))
print(f'Application DB/RPC/REST candidates: {len(issues)}')
for path, line, label in issues: print(f'  REVIEW: {path}:{line} {label}')
print(f'Storage .from calls (intentionally client-side): {len(storage)}')
print(f'Auth occurrences: {len(auth)}; Realtime occurrences: {len(realtime)}; Edge Functions: {len(edge)}')
if issues: raise SystemExit(1)
