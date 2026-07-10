-- 002: allow deleting auth users whose registration code references them.
-- Without this, deleting a user 500s because registration_codes.redeemed_by
-- holds a plain FK. ON DELETE SET NULL keeps the code marked 'used' (burned)
-- while releasing the reference.
alter table public.registration_codes
  drop constraint if exists registration_codes_redeemed_by_fkey;
alter table public.registration_codes
  add constraint registration_codes_redeemed_by_fkey
  foreign key (redeemed_by) references auth.users(id) on delete set null;
