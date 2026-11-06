#!/usr/bin/env bash
# Activate the already-issued certificate for the isolated ACE static preview.
set -euo pipefail
umask 022

test "$(pwd -P)" = /home/sergey/Projects/ACE-CLIENT-DEPLOY
test "$(sudo -n sha256sum /etc/nginx/conf.d/zz-ace.imon.world.conf | cut -d ' ' -f1)" = 64ad79e7221fb96f15354eecfe9b3a5806cd64423061e0275b8b762210c47f03
test "$(sha256sum deploy/nginx-https.conf | cut -d ' ' -f1)" = 45f2e62f1ce31755ce2f79e8a069ce003e8e4427d2631b8163cd1524a6110597
sudo -n test ! -e /etc/nginx/conf.d/.zz-ace.imon.world.pending
sudo -n test -f /etc/letsencrypt/live/ace-imon-world/fullchain.pem
sudo -n test -f /etc/letsencrypt/live/ace-imon-world/privkey.pem
sudo -n openssl x509 -in /etc/letsencrypt/live/ace-imon-world/fullchain.pem -noout -checkhost ace.imon.world -checkend 86400
test "$(readlink /srv/ace-preview/current)" = releases/20261106-3727ded

sudo -n install -m 0644 deploy/nginx-https.conf /var/backups/ace-preview-20261106-3727ded/ace-https.conf
sudo -n install -m 0644 deploy/nginx-https.conf /etc/nginx/conf.d/.zz-ace.imon.world.pending
sudo -n mv /etc/nginx/conf.d/.zz-ace.imon.world.pending /etc/nginx/conf.d/zz-ace.imon.world.conf
if ! sudo -n nginx -t; then
  sudo -n install -m 0644 /var/backups/ace-preview-20261106-3727ded/ace-http.conf /etc/nginx/conf.d/zz-ace.imon.world.conf
  sudo -n nginx -t
  exit 1
fi
sudo -n systemctl reload nginx
for ace_attempt in 1 2 3 4 5; do
  if test "$(curl --silent --show-error --noproxy '*' --max-time 8 --resolve ace.imon.world:443:94.249.186.240 -o /dev/null -w '%{http_code}' https://ace.imon.world/ || true)" = 200; then
    test "$(curl --silent --show-error --noproxy '*' --max-time 8 --resolve ace.imon.world:80:94.249.186.240 -o /dev/null -w '%{http_code}' http://ace.imon.world/)" = 308
    printf 'ACE_HTTPS_READY https://ace.imon.world\n'
    exit 0
  fi
  sleep 1
done
exit 1
