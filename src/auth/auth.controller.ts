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
  async createKey(@Body() dto: CreateKeyInputDto): Promise<ApiKeyOutputDto> {
    const result = await this.authService.generateKey(dto);
    // publicKey() whitelists the response so secret_hash, the encrypted secret
    // and _plaintext_secret never leak; `secret` carries the one-time plaintext.
    return this.authService.publicKey(result, result._plaintext_secret) as unknown as ApiKeyOutputDto;
  }

  @Get()
  @ApiOperation({ summary: 'List API keys (secrets masked)' })
  @ApiOkResponse({ type: [ApiKeyOutputDto] })
  async listKeys(): Promise<ApiKeyOutputDto[]> {
    const keys = await this.authService.listKeys();
    return keys.map((k) => this.authService.publicKey(k) as unknown as ApiKeyOutputDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Revoke an API key' })
  async revokeKey(@Param('id') id: string): Promise<{ id: string; revoked: boolean }> {
    const key = await this.authService.revokeKey(id);
    if (!key) return { id, revoked: false };
    return { id: key.id, revoked: true };
  }
}
