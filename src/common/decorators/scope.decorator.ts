import { SetMetadata } from '@nestjs/common';

export const REQUIRED_SCOPE_KEY = 'required_scope';

/**
 * Scopes accepted by a route. Multiple scopes are OR'd: a key passes if it
 * holds any one of them (e.g. protocol-level data readable by both admin
 * `read` keys and partner `partner:read` keys).
 */
export const RequiredScope = (...scopes: string[]) => SetMetadata(REQUIRED_SCOPE_KEY, scopes);
