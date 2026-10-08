"""Check real Electron compositor artifacts. This does not certify a printer driver."""
import json
import pathlib
import re
import sys
from pypdf import PdfReader
import pypdfium2 as pdfium

root = pathlib.Path(sys.argv[1])
results = []
for name in ['draft', 'pad-short', 'full-short', 'pad-multipage', 'full-multipage']:
    filename = root / (name + '.pdf')
    reader = PdfReader(filename)
    pages = [page.extract_text() or '' for page in reader.pages]
    text = ''.join(pages)
    compact = re.sub(r'\s+', '', text)
    assert ('Syntheticlongupgradedreport' if 'multipage' in name else 'Syntheticupgradedruntime') in compact, name
    assert (len(pages) > 1 if 'multipage' in name else len(pages) == 1), name
    assert ('DRAFT' in text if name == 'draft' else 'DRAFT' not in text), name
    for number, page in enumerate(pages, 1):
        assert 'Patient ID:' in page and 'Order #' in page, (name, number)
        assert f'Page {number} of {len(pages)}' in page, (name, number)
    assert 'Reference interval not configured' in text, name
    width = float(reader.pages[0].mediabox.width) * 25.4 / 72
    height = float(reader.pages[0].mediabox.height) * 25.4 / 72
    assert abs(width - 210) < .3 and abs(height - 297) < .3, name
    document = pdfium.PdfDocument(filename)
    document[0].render(scale=1.2).to_pil().save(root / (name + '-first.png'))
    if len(document) > 1:
        document[len(document) - 1].render(scale=1.2).to_pil().save(root / (name + '-last.png'))
    results.append({'fixture': name, 'pages': len(pages), 'widthMm': width, 'heightMm': height})
(root / 'pdf-verification.json').write_text(json.dumps(results, indent=2))
print(json.dumps(results, indent=2))
