import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PublicationMatchingService } from '../publications/matching/publication-matching.service';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const matching = app.get(PublicationMatchingService);
    const result = await matching.backfillActivePublications();

    console.log(
      `Backfill completed: ${result.publicationsProcessed} active LOST sources processed, ${result.suggestionsGenerated} suggestions generated.`,
    );
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error('Publication match backfill failed.');
  console.error(error);
  process.exitCode = 1;
});
