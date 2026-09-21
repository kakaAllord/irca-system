import { PipeTransform } from '@nestjs/common';
import { z } from 'zod';
import { validation } from './app-error.js';

/**
 * Validates a body or query against a zod schema from @irca/shared, the same
 * schema the portal checks its forms with, and hands the handler the parsed,
 * typed value. Failures become 400 VALIDATION_FAILED with errors per field.
 */
export class ZodPipe<T extends z.ZodType> implements PipeTransform<unknown, z.output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) throw validation(z.flattenError(result.error).fieldErrors);
    return result.data;
  }
}
