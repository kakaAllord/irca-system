-- People added by hand in Membership were saved with the column's default,
-- 'FORM', from when the column was added until the code said 'OFFICE'. A
-- person with no registration did not come from the form; Outreach's own
-- are 'OUTREACH' and are left alone.
update people set source = 'OFFICE' where registration_id is null and source = 'FORM';
