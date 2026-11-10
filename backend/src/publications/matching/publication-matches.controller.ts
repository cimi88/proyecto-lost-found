import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import type { PublicationMatchesResponse } from './publication-matching-response';
import { PublicationMatchingService } from './publication-matching.service';

const UUID_VALIDATION_EXCEPTION = new ParseUUIDPipe({
  exceptionFactory: () =>
    new BadRequestException({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Invalid request data',
      details: [
        {
          field: 'id',
          message: 'El identificador debe ser un UUID válido.',
        },
      ],
    }),
});

@Controller('v1/publications')
export class PublicationMatchesController {
  constructor(
    private readonly publicationMatching: PublicationMatchingService,
  ) {}

  @Get(':id/matches')
  getMatches(
    @Param('id', UUID_VALIDATION_EXCEPTION) id: string,
  ): Promise<PublicationMatchesResponse> {
    return this.publicationMatching.getSuggestionsForPublication(id);
  }
}
