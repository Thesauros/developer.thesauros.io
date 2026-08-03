import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CreateKeyInputDto, ApiKeyOutputDto } from './dto';
import { RequiredScope } from '../common/decorators';

@ApiTags('Keys')
@ApiBearerAuth()
@Controller('keys')
@RequiredScope('keys:admin')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post()
  @ApiOperation({ summary: 'Create API key', description: 'Secret is shown only once in the response.' })
  @ApiOkResponse({ type: ApiKeyOutputDto })
  createKey(@Body() dto: CreateKeyInputDto): ApiKeyOutputDto {
    const result = this.authService.generateKey(dto);
    return { ...result, secret: result._plaintext_secret } as unknown as ApiKeyOutputDto;
  }

  @Get()
  @ApiOperation({ summary: 'List API keys (secrets masked)' })
  @ApiOkResponse({ type: [ApiKeyOutputDto] })
  listKeys(): ApiKeyOutputDto[] {
    return this.authService.listKeys().map((k) => this.authService.publicKey(k) as unknown as ApiKeyOutputDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Revoke an API key' })
  revokeKey(@Param('id') id: string): { id: string; revoked: boolean } {
    const key = this.authService.revokeKey(id);
    if (!key) return { id, revoked: false };
    return { id: key.id, revoked: true };
  }
}
