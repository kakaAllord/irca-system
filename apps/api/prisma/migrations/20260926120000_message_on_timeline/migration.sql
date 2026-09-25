-- Every text sent to a person goes on their timeline, so the next person to
-- call them can see they were texted (09 step 9.3).
ALTER TYPE "InteractionKind" ADD VALUE 'MESSAGE_SENT';
