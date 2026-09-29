"""Package a portable source/weights/submission snapshot without local caches."""
from pathlib import Path
import hashlib
import json
import zipfile

ROOT = Path(__file__).resolve().parent


def main():
    files = [ROOT / name for name in (
        '.gitignore', '.dockerignore', '.env.example', 'README.md',
        'SUBMISSION_GUIDE.md', 'DEFENSE.md', 'docker-compose.yml', 'Dockerfile.frontend',
        'nginx.conf', 'generate_submission.py', 'prepare_weights.py',
        'package_submission.py', 'evaluate.py', 'train.csv',
        'test_query.csv', 'test_gallery.csv', 'weights/resnet18.pth',
        'artifacts/submission.csv', 'artifacts/candidates.csv',
        'artifacts/embeddings.npy',
    )]
    for folder in ('backend', 'frontend', 'tests'):
        files.extend(p for p in (ROOT / folder).rglob('*') if p.is_file()
                     and not {'node_modules', 'dist', '__pycache__', '.pytest_cache'}.intersection(p.parts)
                     and p.suffix != '.pyc')
    for path in files:
        if not path.is_file():
            raise FileNotFoundError(path)
    target = ROOT / 'dist' / 'falcon-submission.zip'
    target.parent.mkdir(exist_ok=True)
    hashes = {}
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(set(files)):
            name = path.relative_to(ROOT).as_posix()
            data = path.read_bytes()
            hashes[name] = hashlib.sha256(data).hexdigest()
            archive.writestr(name, data)
        archive.writestr('MANIFEST.sha256.json', json.dumps(hashes, indent=2))
    with zipfile.ZipFile(target) as archive:
        if archive.testzip() is not None:
            raise RuntimeError('Archive integrity check failed')
    print(f'{target}\n{len(hashes)} files, {target.stat().st_size} bytes')


if __name__ == '__main__':
    main()
