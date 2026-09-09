/**
 * One-shot: old default highlightScore 5 (neutral) → 0 (unscored).
 * Intentional 5s cannot be distinguished from the old default; all 5s become 0.
 *
 * Run: npx tsx scripts/migrate-highlight-score-default.ts
 * or after deploy with schema change (MIGRATE_DB=1).
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const photos = await prisma.photo.updateMany({
    where: { highlightScore: 5 },
    data: { highlightScore: 0 },
  });
  const places = await prisma.place.updateMany({
    where: { highlightScore: 5 },
    data: { highlightScore: 0 },
  });
  console.log(
    `migrate-highlight-score-default: photos=${photos.count} places=${places.count}`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
