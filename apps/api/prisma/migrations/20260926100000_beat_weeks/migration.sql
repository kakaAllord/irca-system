-- A beat may send in chosen weeks of the month only: Finance reminds people
-- about their pledges on the first Monday of each month (09 step 9.3).
-- Empty, as every existing beat is, means every week.
ALTER TABLE "comms_schedules" ADD COLUMN     "weeks_of_month" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
