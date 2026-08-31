/**
 * One-shot: Place.comment → Note(type=PLACE), then clear comment.
 * Run: npx tsx scripts/migrate-place-comments.ts
 * or:  npm run db:migrate-place-notes
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const places = await prisma.place.findMany({
    where: { comment: { not: null } },
  });

  let migrated = 0;
  let skipped = 0;

  for (const place of places) {
    const text = place.comment?.trim();
    if (!text) {
      await prisma.place.update({
        where: { id: place.id },
        data: { comment: null },
      });
      skipped += 1;
      continue;
    }

    const existing = await prisma.note.findFirst({
      where: {
        placeId: place.id,
        type: "PLACE",
        text,
      },
    });

    if (!existing) {
      await prisma.note.create({
        data: {
          travelId: place.travelId,
          userId: place.userId,
          placeId: place.id,
          type: "PLACE",
          text,
        },
      });
      migrated += 1;
    } else {
      skipped += 1;
    }

    await prisma.place.update({
      where: { id: place.id },
      data: { comment: null },
    });
  }

  console.log(
    `migrate-place-comments: ${migrated} notas creadas, ${skipped} omitidas, ${places.length} lugares con comment`
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
