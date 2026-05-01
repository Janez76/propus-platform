-- Fix Janez photographer email so calendar/availability lookups hit the correct Outlook mailbox.
-- Previous seed wrote 'janez@propus.ch'; the actual mailbox is 'janez.smirmaul@propus.ch'.
UPDATE booking.photographers
   SET email = 'janez.smirmaul@propus.ch',
       name  = 'Janez Smirmaul',
       phone = COALESCE(NULLIF(phone, ''), '+41 76 340 70 75')
 WHERE key = 'janez'
   AND email IS DISTINCT FROM 'janez.smirmaul@propus.ch';

UPDATE booking.photographers
   SET email = 'ivan.mijajlovic@propus.ch',
       name  = 'Ivan Mijajlovic'
 WHERE key = 'ivan'
   AND email IS DISTINCT FROM 'ivan.mijajlovic@propus.ch';
