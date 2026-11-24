-- Enforce the per-user API token cap at the database level. The application
-- count check is helpful for a friendly error, but concurrent creates can all
-- observe a stale count, so the constraint is the actual guarantee.
-- Keep 25 in sync with MAX_API_TOKENS_PER_USER in api-token.constants.ts.
CREATE OR REPLACE FUNCTION enforce_api_token_limit()
RETURNS TRIGGER AS $$
BEGIN
    IF (SELECT COUNT(*) FROM "ApiToken" WHERE "userId" = NEW."userId") >= 25 THEN
        RAISE EXCEPTION 'API token limit exceeded'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER api_token_limit_guard
BEFORE INSERT ON "ApiToken"
FOR EACH ROW
EXECUTE FUNCTION enforce_api_token_limit();
