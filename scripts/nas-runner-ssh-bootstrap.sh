#!/bin/sh
# Einmalig auf dem NAS als root ausführen (oder per SSH pipe):
#   ssh Janez@nas 'sudo bash -s' < scripts/nas-runner-ssh-bootstrap.sh
# Richtet known_hosts + ssh/config für User github-runner ein.
set -eu
install -d -m 700 -o github-runner -g github-runner /home/github-runner/.ssh
ssh-keyscan -H github.com >> /home/github-runner/.ssh/known_hosts 2>/dev/null || true
cat > /home/github-runner/.ssh/config <<'EOF'
Host github.com
  HostName github.com
  User git
  IdentityFile /home/github-runner/.ssh/id_ed25519
  IdentitiesOnly yes
EOF
chown github-runner:github-runner /home/github-runner/.ssh/known_hosts /home/github-runner/.ssh/config 2>/dev/null || true
chmod 600 /home/github-runner/.ssh/known_hosts /home/github-runner/.ssh/config 2>/dev/null || true
echo "[nas-runner-ssh-bootstrap] ok"
