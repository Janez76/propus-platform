-- sent_at: NOW() ist innerhalb einer Transaktion konstant → mehrere Mails im gleichen
-- Request zeigten im Admin identische Zeitstempel. clock_timestamp() wechselt pro Zeile.
ALTER TABLE email_send_log
  ALTER COLUMN sent_at SET DEFAULT clock_timestamp();
