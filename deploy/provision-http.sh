#!/usr/bin/env bash
# One-time isolated ACE preview deployment. Run from the verified ACE checkout.
set -euo pipefail
umask 022

test "$(pwd -P)" = /home/sergey/Projects/ACE-CLIENT-DEPLOY
test "$(git rev-parse HEAD)" = 3727ded809dcdee9fee0fce91b81116d6264450d
git diff --quiet HEAD -- index.html news-preview.html assets bids-offers .nojekyll
git ls-tree -r HEAD index.html news-preview.html assets bids-offers .nojekyll |
  awk '$1 != "100644" {print; bad=1} END {exit bad}'
test "$(sha256sum deploy/nginx-http.conf | cut -d ' ' -f1)" = 64ad79e7221fb96f15354eecfe9b3a5806cd64423061e0275b8b762210c47f03
test "$(sha256sum deploy/nginx-https.conf | cut -d ' ' -f1)" = 45f2e62f1ce31755ce2f79e8a069ce003e8e4427d2631b8163cd1524a6110597
sudo -n test ! -e /srv/ace-preview
sudo -n test ! -e /etc/nginx/conf.d/zz-ace.imon.world.conf
sudo -n test ! -e /var/backups/ace-preview-20261106-3727ded
sudo -n nginx -t

sudo -n install -d -m 0700 /var/backups/ace-preview-20261106-3727ded
sudo -n cp -a /etc/nginx/nginx.conf /var/backups/ace-preview-20261106-3727ded/nginx.conf.before
sudo -n cp -a /etc/imon-projects/domains.json /var/backups/ace-preview-20261106-3727ded/domains.json.before
sudo -n install -d -m 0755 /srv/ace-preview/releases/20261106-3727ded
git archive HEAD index.html news-preview.html assets bids-offers .nojekyll |
  sudo -n tar -xf - -C /srv/ace-preview/releases/20261106-3727ded
sudo -n chown -R root:root /srv/ace-preview/releases/20261106-3727ded
sudo -n find /srv/ace-preview/releases/20261106-3727ded -type d -exec chmod 0755 '{}' +
sudo -n find /srv/ace-preview/releases/20261106-3727ded -type f -exec chmod 0644 '{}' +
sudo -n ln -s releases/20261106-3727ded /srv/ace-preview/current

sudo -n install -m 0644 deploy/nginx-http.conf /var/backups/ace-preview-20261106-3727ded/ace-http.conf
# zz preserves the pre-existing implicit HTTP default virtual host.
sudo -n ln /var/backups/ace-preview-20261106-3727ded/ace-http.conf /etc/nginx/conf.d/zz-ace.imon.world.conf
if ! sudo -n nginx -t; then
  sudo -n mv /etc/nginx/conf.d/zz-ace.imon.world.conf /var/backups/ace-preview-20261106-3727ded/ace-http.failed.conf
  exit 1
fi
sudo -n systemctl reload nginx
for ace_attempt in 1 2 3 4 5; do
  if test "$(curl --silent --show-error --noproxy '*' --max-time 8 --resolve ace.imon.world:80:94.249.186.240 -o /dev/null -w '%{http_code}' http://ace.imon.world/ || true)" = 503; then
    printf 'ACE_HTTP_READY release=%s\n' /srv/ace-preview/releases/20261106-3727ded
    exit 0
  fi
  sleep 1
done
exit 1
