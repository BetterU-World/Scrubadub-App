// Runs in the disposable guest. Parser data and diagnostics stay on its temporary filesystem.
export const pdfPublicationPolicy = String.raw`
import json, re, subprocess, sys, tempfile
from pathlib import Path

QPDF = '/vercel/pdf-deps/bin/qpdf'
INPUT = Path('/vercel/input.pdf')
LIMIT = 24 * 1024 * 1024
BLOCKED = {
  '/A', '/AA', '/AF', '/AcroForm', '/Annots', '/Collection', '/EmbeddedFile',
  '/EmbeddedFiles', '/Encrypt', '/EF', '/FDF', '/Filespec', '/JavaScript', '/JS',
  '/Launch', '/Movie', '/Next', '/OpenAction', '/Perms', '/Prev', '/RichMedia',
  '/Rendition', '/Sound', '/SubmitForm', '/URI', '/XFA', '/XRefStm', '/3D',
  '/GoTo', '/GoTo3DView', '/GoToE', '/GoToR', '/ImportData', '/ResetForm',
  '/SetOCGState', '/Thread', '/Trans', '/PS', '/Requirements', '/Extensions',
  '/AlternatePresentations',
}
FILTERS = {'/FlateDecode', '/DCTDecode'}
STRUCTURE = ['--suppress-recovery', '--global', '--parser-max-nesting=48',
             '--parser-max-errors=1', '--parser-max-container-size=12000',
             '--parser-max-container-size-damaged=12000', '--max-stream-filters=2', '--']

class Rejected(Exception):
    pass

def inspect_with_qpdf(args, directory):
    output, errors = directory / 'output', directory / 'errors'
    with output.open('wb') as stdout, errors.open('wb') as stderr:
        result = subprocess.run(
            ['timeout', '--kill-after=1s', '4s', 'prlimit', '--as=268435456', '--cpu=3',
             '--fsize=25165824', '--nofile=32', '--core=0', '--', QPDF, *STRUCTURE, *args, INPUT],
            stdout=stdout, stderr=stderr, check=False,
        )
    if result.returncode in (125, 126, 127):
        raise RuntimeError('worker')
    if result.returncode != 0 or errors.stat().st_size or output.stat().st_size >= LIMIT:
        raise Rejected()
    return output

def reject_duplicate_keys(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise Rejected()
        result[key] = value
    return result

def validate_objects(document):
    if not isinstance(document, dict) or not isinstance(document.get('qpdf'), list) or len(document['qpdf']) != 2:
        raise RuntimeError('worker')
    metadata, objects = document['qpdf']
    if metadata.get('jsonversion') != 2 or not isinstance(objects, dict) or 'trailer' not in objects:
        raise RuntimeError('worker')
    if len(objects) > 12000:
        raise Rejected()
    trailer = objects['trailer'].get('value', {})
    if not isinstance(trailer, dict) or not isinstance(trailer.get('/Root'), str):
        raise Rejected()
    root = objects.get('obj:' + trailer['/Root'], {}).get('value', {})
    if not isinstance(root, dict) or root.get('/Type') != '/Catalog':
        raise Rejected()
    pending = [objects]
    nodes = 0
    while pending:
        item = pending.pop()
        nodes += 1
        if nodes > 120000:
            raise Rejected()
        if isinstance(item, dict):
            if BLOCKED.intersection(item) or any(
              isinstance(item.get(key), str) and item[key] in BLOCKED for key in ('/Type', '/S', '/Subtype')
            ):
                raise Rejected()
            if '/Filter' in item:
                filters = item['/Filter'] if isinstance(item['/Filter'], list) else [item['/Filter']]
                if not filters or len(filters) > 2 or any(not isinstance(f, str) or f not in FILTERS for f in filters):
                    raise Rejected()
            # Stream dictionaries may reference an external file with /F.
            if isinstance(item.get('stream'), dict):
                stream = item['stream']
                if not isinstance(stream.get('dict'), dict) or '/F' in stream['dict'] or not isinstance(stream.get('data'), str):
                    raise Rejected()
            pending.extend(item.values())
        elif isinstance(item, list):
            pending.extend(item)

try:
    if not (0 < INPUT.stat().st_size <= 10 * 1024 * 1024):
        raise Rejected()
    with INPUT.open('rb') as pdf:
        if not re.fullmatch(rb'%PDF-[12]\.[0-9]', pdf.read(8)):
            raise Rejected()
        pdf.seek(-min(64, INPUT.stat().st_size), 2)
        if not pdf.read().rstrip(b'\r\n\t ').endswith(b'%%EOF'):
            raise Rejected()
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory)
        inspect_with_qpdf(['--check'], path)
        output = inspect_with_qpdf(['--json=2', '--json-key=qpdf', '--json-stream-data=inline', '--decode-level=generalized'], path)
        with output.open() as result:
            validate_objects(json.load(result, object_pairs_hook=reject_duplicate_keys))
    print('passed')
except Rejected:
    print('rejected')
except (OSError, ValueError, TypeError, KeyError, AttributeError, RuntimeError, RecursionError):
    print('unavailable')
`;
