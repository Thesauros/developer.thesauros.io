import { applyDecorators, Type } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, ApiProperty, getSchemaPath } from '@nestjs/swagger';

/**
 * Every response leaves through ResponseEnvelopeInterceptor as
 * `{object, data}` (plus `meta` for paginated lists). Documenting the bare
 * payload would describe a body clients never receive, so these decorators
 * wrap the payload schema in the envelope the API actually sends.
 */

export class ListMetaDto {
  @ApiProperty({ example: 42, description: 'Total rows matching the query, across all pages.' })
  total: number;

  @ApiProperty({ example: 50, description: 'Page size in effect (1-200).' })
  limit: number;

  @ApiProperty({ example: true })
  has_more: boolean;

  @ApiProperty({
    nullable: true,
    example: 'bzo1MA',
    description: 'Pass back as ?cursor= for the next page. null on the last page.',
  })
  next_cursor: string | null;
}

/** Single resource: `{object: "<type>", data: {...}}`. */
export function ApiEnvelope<T extends Type<unknown>>(model: T, options: { description?: string } = {}) {
  return applyDecorators(
    ApiExtraModels(model),
    ApiOkResponse({
      description: options.description,
      schema: {
        type: 'object',
        required: ['object', 'data'],
        properties: {
          object: { type: 'string', example: 'object' },
          data: { $ref: getSchemaPath(model) },
        },
      },
    }),
  );
}

/** Unpaginated collection: `{object: "list", data: [...]}`. */
export function ApiEnvelopeList<T extends Type<unknown>>(model: T, options: { description?: string } = {}) {
  return applyDecorators(
    ApiExtraModels(model),
    ApiOkResponse({
      description: options.description,
      schema: {
        type: 'object',
        required: ['object', 'data'],
        properties: {
          object: { type: 'string', example: 'list' },
          data: { type: 'array', items: { $ref: getSchemaPath(model) } },
        },
      },
    }),
  );
}

/** Cursor-paginated collection: `{object: "list", data: [...], meta: {...}}`. */
export function ApiEnvelopePaged<T extends Type<unknown>>(model: T, options: { description?: string } = {}) {
  return applyDecorators(
    ApiExtraModels(model, ListMetaDto),
    ApiOkResponse({
      description: options.description,
      schema: {
        type: 'object',
        required: ['object', 'data', 'meta'],
        properties: {
          object: { type: 'string', example: 'list' },
          data: { type: 'array', items: { $ref: getSchemaPath(model) } },
          meta: { $ref: getSchemaPath(ListMetaDto) },
        },
      },
    }),
  );
}
