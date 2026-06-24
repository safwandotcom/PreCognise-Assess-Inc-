-- Drop global unique indexes on Candidate
DROP INDEX IF EXISTS "Candidate_rollNumber_key";
DROP INDEX IF EXISTS "Candidate_email_key";

-- Create session-scoped composite unique indexes
CREATE UNIQUE INDEX "Candidate_rollNumber_sessionId_key" ON "Candidate"("rollNumber", "sessionId");
CREATE UNIQUE INDEX "Candidate_email_sessionId_key" ON "Candidate"("email", "sessionId");
