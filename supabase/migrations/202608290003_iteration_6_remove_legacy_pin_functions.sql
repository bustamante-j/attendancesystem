begin;

-- Edge Functions now call the encrypted-secret overloads. Remove the legacy
-- plaintext-only signatures so no deployed client can create a PIN that a
-- Super Admin cannot later recover from the encrypted escrow columns.
drop function if exists public.create_event_secure(
  uuid,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz,
  timestamptz,
  text,
  timestamptz,
  timestamptz,
  uuid[],
  smallint[],
  text
);

drop function if exists public.reset_event_pin_secure(uuid, uuid, text);

commit;
