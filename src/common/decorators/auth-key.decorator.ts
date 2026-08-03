import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const AuthKey = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.apiKey ?? null;
  },
);

export const PartnerId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.partnerId ?? null;
  },
);
