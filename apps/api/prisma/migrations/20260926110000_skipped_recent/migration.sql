-- Someone a reminding audience (pledges) reached within Communications'
-- cooldown is left alone, and listed as such, like someone who opted out
-- (09 step 9.3).
ALTER TYPE "RecipientStatus" ADD VALUE 'SKIPPED_RECENT';
