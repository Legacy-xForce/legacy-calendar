-- Passkeys are registered at Legacy Auth now (its RP ID differs from the calendar's, so these
-- credentials cannot be carried over). Back up before applying: this drops rows.

-- DropForeignKey
ALTER TABLE "PasskeyCredential" DROP CONSTRAINT "PasskeyCredential_userId_fkey";

-- DropTable
DROP TABLE "PasskeyCredential";
