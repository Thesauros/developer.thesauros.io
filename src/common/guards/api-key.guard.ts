import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AuthService } from '../../auth/auth.service';
import { REQUIRED_SCOPE_KEY } from '../decorators/scope.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization ?? '';
    const match = header.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      throw new UnauthorizedException('Missing Authorization header. Use "Authorization: Bearer <key>".');
    }
    const secret = match[1].trim();
    const result = await this.authService.authenticate(secret);
    if ('error' in result) {
      if (result.reason === 'forbidden') {
        throw new ForbiddenException(result.error);
      }
      throw new UnauthorizedException(result.error);
    }
    const requiredScopes = this.reflector.getAllAndOverride<string[]>(REQUIRED_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (requiredScopes?.length && !requiredScopes.some((s) => this.authService.hasScope(result.key, s))) {
      throw new ForbiddenException(
        requiredScopes.length === 1
          ? `This API key lacks the "${requiredScopes[0]}" scope required for this endpoint.`
          : `This API key lacks any of the scopes required for this endpoint: ${requiredScopes.join(', ')}.`,
      );
    }
    (request as any).apiKey = result.key;
    (request as any).partnerId = result.key.partner_id ?? null;
    return true;
  }
}
