"""Run with sudo on the existing Ubuntu host; publish only BCRAG web assets."""
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
from datetime import datetime


def main():
    archive = Path(sys.argv[1]).resolve()
    config = Path('/etc/nginx/sites-available/brag')
    current = Path('/var/www/bcrag/web')
    stamp = datetime.now().strftime('%Y%m%d-%H%M%S')
    release = Path('/var/www/bcrag/web-releases') / stamp
    if current.exists() and not current.is_symlink():
        raise RuntimeError('Existing web path is not a symlink; inspect before publishing.')
    before = config.read_text()
    if 'server_name brag.worldlinesite.com;' not in before:
        raise RuntimeError('Unexpected Nginx site; refusing to modify it.')
    old = '    location / {\n        return 404;\n    }'
    new = '''    location / {
        root /var/www/bcrag/web;
        index index.html;
        try_files $uri $uri/ =404;
        add_header Cache-Control "no-cache";
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-Frame-Options "DENY" always;
        add_header Referrer-Policy "no-referrer" always;
    }'''
    if old not in before and new not in before:
        raise RuntimeError('Unexpected web location; inspect before publishing.')
    with tarfile.open(archive, 'r:gz') as bundle:
        for item in bundle.getmembers():
            target = (release / item.name).resolve()
            if target != release and release not in target.parents:
                raise RuntimeError('Invalid archive path')
            if not (item.isfile() or item.isdir()):
                raise RuntimeError('Archive must contain only files and directories')
        release.mkdir(parents=True)
        bundle.extractall(release)
    if not (release / 'index.html').is_file():
        raise RuntimeError('Missing index.html')
    for item in [release] + list(release.rglob('*')):
        item.chmod(0o755 if item.is_dir() else 0o644)
    backup = config.with_name('brag.backup-' + stamp)
    shutil.copy2(config, backup)
    previous = os.readlink(current) if current.is_symlink() else None
    pending = current.with_name('web-next-' + stamp)
    pending.symlink_to(release, target_is_directory=True)
    pending.replace(current)
    try:
        config.write_text(before.replace(old, new, 1))
        subprocess.run(['nginx', '-t'], check=True)
        subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
    except Exception:
        config.write_text(before)
        current.unlink()
        if previous:
            current.symlink_to(previous, target_is_directory=True)
        subprocess.run(['nginx', '-t'], check=True)
        subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
        raise
    print('Published:', release)
    print('Nginx backup:', backup)


if __name__ == '__main__':
    main()
