-- Admin-Users: Avatar-URL (serialisiert als Pfad unterhalb der Static-Route
-- /assets/admin-avatars/... oder absolute URL bei CDN-Ablage).
ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;
