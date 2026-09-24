"""Prepare exact-SKU gallery candidates for human/agent visual review, never publish.

Uses retailer image URLs already retained in the source-review evidence. No image
filenames are guessed. Downloads stop on the first denial or rate-limit response.
Run with a Python runtime containing Pillow:
  python scripts/review-gallery-upgrades.py --output /tmp/kora-gallery-review --limit 25
"""
import argparse
import hashlib
import io
import json
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageDraw, ImageOps

PROJECT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--offset', type=int, default=0)
    parser.add_argument('--limit', type=int, default=25)
    parser.add_argument('--interval', type=float, default=0.5)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    products = {p['id']: p for p in json.loads((PROJECT / 'data/products.json').read_text())}
    galleries = json.loads((PROJECT / 'data/product-galleries.json').read_text())
    review = json.loads((PROJECT / 'data/gallery-source-review.json').read_text())
    excluded = review['bulkVisualReview']['excludedProducts']
    candidates = []
    for pid, record in review['retailerSourceAttempts'].items():
        if (pid in excluded or pid not in products or len(galleries.get(pid, [])) >= 5
                or str(record.get('responseSku')) != pid.removeprefix('bbca-')
                or len(record.get('exactSourceImages', [])) < 5):
            continue
        if products[pid].get('imageVerificationStatus') == 'under_review':
            continue
        candidates.append((pid, record))
    report = {'checkedAt': datetime.now(timezone.utc).date().isoformat(),
              'candidateProducts': len(candidates), 'published': False,
              'note': 'Candidate collection only. Exact-model, color, distinct-view and accessory checks must be completed before import.',
              'products': {}, 'validation': [], 'stopped': None}
    for pid, record in candidates[args.offset:args.offset + args.limit]:
        folder = args.output / pid
        folder.mkdir(exist_ok=True)
        product = products[pid]
        result = {'id': pid, 'name': product['name'], 'sourceUrl': record['sourceUrl'],
                  'sourceSku': record['responseSku'], 'sourceName': record['sourceName'],
                  'existingImages': galleries.get(pid, []), 'images': []}
        for index, media in enumerate(record['exactSourceImages'][:10], 1):
            url = media.get('url')
            if not url or str(media.get('mimeType', '')).lower() != 'image':
                continue
            local = folder / f'{index:02d}.image'
            checkfile = folder / f'{index:02d}.json'
            try:
                if local.exists() and checkfile.exists():
                    body = local.read_bytes()
                    check = json.loads(checkfile.read_text())
                    assert check['url'] == url
                else:
                    time.sleep(max(0, args.interval))
                    request = urllib.request.Request(url, headers={'User-Agent': 'KORA-Product-Gallery-Review/1.0'})
                    with urllib.request.urlopen(request, timeout=30) as response:
                        body = response.read(20 * 1024 * 1024)
                        check = {'url': url, 'httpStatus': response.status,
                                 'contentType': response.headers.get('Content-Type'),
                                 'checkedAt': report['checkedAt']}
                    im = Image.open(io.BytesIO(body)); im.load()
                    check.update({'width': im.width, 'height': im.height, 'bytes': len(body),
                                  'sha256': hashlib.sha256(body).hexdigest(),
                                  'pixelSha256': hashlib.sha256(im.convert('RGB').tobytes()).hexdigest()})
                    assert im.width >= 100 and im.height >= 100
                    local.write_bytes(body)
                    checkfile.write_text(json.dumps(check, indent=2))
                report['validation'].append(check)
                result['images'].append({'view': index, 'url': url, 'thumbnail': media.get('thumbnailUrl'),
                                         'local': str(local), 'pixelSha256': check['pixelSha256']})
            except urllib.error.HTTPError as error:
                if error.code in (403, 429):
                    report['stopped'] = f'HTTP {error.code} from image source; do not bypass access control.'
                    break
                result.setdefault('errors', []).append({'url': url, 'error': str(error)})
            except Exception as error:
                result.setdefault('errors', []).append({'url': url, 'error': str(error)})
        # All downloaded views, including the old ones, appear beside each other
        # so reviewers can reject reused photographs and wrong configurations.
        tile = 220
        images = result['images']
        sheet = Image.new('RGB', (tile * 5, 70 + ((len(images) + 4) // 5) * (tile + 28)), 'white')
        draw = ImageDraw.Draw(sheet)
        draw.text((12, 10), pid + ' | ' + product['name'][:135], fill='black')
        draw.text((12, 30), 'Candidate views only. Reject wrong variants, duplicate angles and product-free graphics.', fill='black')
        for pos, entry in enumerate(images):
            im = Image.open(entry['local']).convert('RGBA')
            bg = Image.new('RGBA', im.size, 'white'); bg.alpha_composite(im)
            thumb = ImageOps.contain(bg.convert('RGB'), (tile - 12, tile - 12))
            x, y = (pos % 5) * tile, 70 + (pos // 5) * (tile + 28)
            sheet.paste(thumb, (x + (tile - thumb.width) // 2, y + (tile - thumb.height) // 2))
            current = any(p['url'] == entry['url'] for p in result['existingImages'])
            draw.text((x + 8, y + tile + 2), f"View {entry['view']}" + (' | CURRENT' if current else ''), fill='black')
        sheet.save(folder / 'review.jpg', quality=92)
        result['reviewSheet'] = str(folder / 'review.jpg')
        report['products'][pid] = result
        (args.output / 'candidates.json').write_text(json.dumps(report, indent=2))
        print(json.dumps({'id': pid, 'images': len(images), 'errors': len(result.get('errors', []))}), flush=True)
        if report['stopped']:
            break
    print(json.dumps({'products': len(report['products']), 'images': len(report['validation']), 'stopped': report['stopped']}))


if __name__ == '__main__':
    main()
