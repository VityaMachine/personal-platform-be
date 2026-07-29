-- CreateEnum
CREATE TYPE "SpaceType" AS ENUM ('PERSONAL', 'SHARED');

-- CreateEnum
CREATE TYPE "SpaceRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');

-- CreateTable
CREATE TABLE "Space" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SpaceType" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Space_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Space_name_not_empty" CHECK (btrim("name") <> '')
);

-- CreateTable
CREATE TABLE "SpaceMember" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "SpaceRole" NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpaceMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Space_ownerId_idx" ON "Space"("ownerId");

-- CreateIndex
CREATE INDEX "Space_type_idx" ON "Space"("type");

-- A lifecycle owner may own at most one Personal Space while owning any number of Shared Spaces.
CREATE UNIQUE INDEX "Space_one_personal_per_owner"
ON "Space"("ownerId")
WHERE "type" = 'PERSONAL';

-- CreateIndex
CREATE UNIQUE INDEX "SpaceMember_spaceId_userId_key" ON "SpaceMember"("spaceId", "userId");

-- CreateIndex
CREATE INDEX "SpaceMember_userId_idx" ON "SpaceMember"("userId");

-- CreateIndex
CREATE INDEX "SpaceMember_spaceId_role_idx" ON "SpaceMember"("spaceId", "role");

-- Every Space may have at most one primary OWNER membership.
CREATE UNIQUE INDEX "SpaceMember_one_owner_per_space"
ON "SpaceMember"("spaceId")
WHERE "role" = 'OWNER';

-- AddForeignKey
ALTER TABLE "Space"
ADD CONSTRAINT "Space_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpaceMember"
ADD CONSTRAINT "SpaceMember_spaceId_fkey"
FOREIGN KEY ("spaceId") REFERENCES "Space"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpaceMember"
ADD CONSTRAINT "SpaceMember_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
