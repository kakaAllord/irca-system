import { Controller, Delete, Get, HttpCode } from '@nestjs/common';
import { Public } from '../auth/decorators.js';
import { MemoryEmailProvider } from './providers/memory.provider.js';

/**
 * Lets a test read the emails the system "sent". Registered only when
 * NODE_ENV is test (see AppModule), and the memory provider is refused
 * outside tests by the configuration itself, so this can never be reachable
 * in production.
 */
@Controller('test/emails')
export class TestEmailController {
  constructor(private readonly provider: MemoryEmailProvider) {}

  @Public()
  @Get()
  list() {
    return this.provider.sent;
  }

  @Public()
  @Delete()
  @HttpCode(204)
  clear() {
    this.provider.sent.length = 0;
  }
}
