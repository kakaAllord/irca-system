import { Injectable, type ArgumentMetadata, type PipeTransform } from '@nestjs/common';
import { notFound } from './app-error.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Path parameters that name a row — `:id`, `:personId`, `:teamId` — are
 * UUIDs everywhere. Something that is not one names nothing, so the answer is
 * 404, the same as for an id that does not exist. Without this, the database
 * refused the malformed value and the request came back as a 500 from every
 * portal.
 *
 * `:stepId` is the registration form's step name, not a row, and is left
 * alone; so is every parameter not named like an id (`:code`, `:key`).
 */
@Injectable()
export class IdParamPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata) {
    if (
      metadata.type === 'param' &&
      metadata.data &&
      metadata.data !== 'stepId' &&
      (metadata.data === 'id' || metadata.data.endsWith('Id')) &&
      (typeof value !== 'string' || !UUID.test(value))
    ) {
      throw notFound();
    }
    return value;
  }
}
