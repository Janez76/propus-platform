#!/bin/bash
# ensure-vps-bind-mounts.sh
#
# Docker legt fehlende Host-Pfade fuer Bind-Mounts als Verzeichnisse an.
# Existiert der Pfad als normale Datei (oder toter Symlink), schlaegt das mit:
#   mkdir /mnt/...: file exists
# fehl. Dieses Skript bereitet die Pfade vor (umbenennen + mkdir -p).
#
# Aufruf: ensure_vps_booking_bind_mounts /opt/propus-platform/.env.vps
#         (Pfad zur .env.vps; Variablen duerfen fehlen → Compose-Defaults)
#
# Wird gesourced; set -e/o liegt beim Aufrufer.

_ensure_one_vps_bind_path() {
  local p="$1"
  local label="$2"

  if [ -z "$p" ] || [ "$p" = "/" ]; then
    echo "FEHLER: ungueltiger Bind-Mount-Pfad ($label)"
    return 1
  fi

  # Bereits eingebundener Host-Pfad (z. B. NFS): nicht anfassen; bei »Host is down« abbrechen.
  if mountpoint -q "$p" 2>/dev/null; then
    if ls "$p" >/dev/null 2>&1; then
      echo "  OK       Bind-Mount-Host $label -> $p (Mountpoint erreichbar)"
      return 0
    fi
    echo "FEHLER: $label ($p) ist Mountpoint, aber nicht lesbar (NFS »Host is down« o. ä.). NAS/Netz pruefen, ggf. mount -a."
    return 1
  fi

  if [ -L "$p" ] && [ ! -d "$p" ]; then
    local bak="${p}.broken-symlink-$(date -u +%Y%m%dT%H%M%SZ)"
    echo "WARNUNG: $label ($p) ist kein Verzeichnis-Symlink – verschiebe nach $bak"
    mv "$p" "$bak" || {
      echo "FEHLER: konnte Symlink $p nicht umbenennen"
      return 1
    }
  elif [ -e "$p" ] && [ ! -d "$p" ]; then
    local bak="${p}.was-not-dir-$(date -u +%Y%m%dT%H%M%SZ)"
    echo "WARNUNG: $label ($p) ist keine Verzeichnis – verschiebe nach $bak"
    mv "$p" "$bak" || {
      echo "FEHLER: konnte $p nicht umbenennen"
      return 1
    }
  fi

  mkdir -p "$p" || {
    echo "FEHLER: mkdir -p $p ($label) fehlgeschlagen"
    return 1
  }
  echo "  OK       Bind-Mount-Host $label -> $p"
}

_env_line_val() {
  local env_file="$1"
  local key="$2"
  grep -E "^${key}=" "$env_file" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '\r' | sed "s/^['\"]//;s/['\"]\$//"
}

# Wird von deploy-remote.sh und rollback-vps.sh gesourced.
ensure_vps_booking_bind_mounts() {
  local env_file="${1:-}"
  local staging="/opt/propus-upload-staging"
  local customer="/mnt/propus-nas-customers"
  local raw="/mnt/propus-nas-raw"
  local val

  if [ -n "$env_file" ] && [ -f "$env_file" ]; then
    val=$(_env_line_val "$env_file" "BOOKING_UPLOAD_STAGING_HOST_PATH")
    [ -n "$val" ] && staging="$val"
    val=$(_env_line_val "$env_file" "BOOKING_UPLOAD_CUSTOMER_HOST_PATH")
    [ -n "$val" ] && customer="$val"
    val=$(_env_line_val "$env_file" "BOOKING_UPLOAD_RAW_HOST_PATH")
    [ -n "$val" ] && raw="$val"
  fi

  echo "==> Buchungs-Upload Bind-Mounts auf dem Host pruefen"
  _ensure_one_vps_bind_path "$staging" "BOOKING_UPLOAD_STAGING_HOST_PATH" || return 1
  _ensure_one_vps_bind_path "$customer" "BOOKING_UPLOAD_CUSTOMER_HOST_PATH" || return 1
  _ensure_one_vps_bind_path "$raw" "BOOKING_UPLOAD_RAW_HOST_PATH" || return 1
}
