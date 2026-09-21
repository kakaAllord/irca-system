import { Global, Module } from '@nestjs/common';
import { Db } from './db.service.js';
import { PrismaCore, PrismaRo, PrismaRw } from './prisma-clients.js';

@Global()
@Module({
  providers: [PrismaCore, PrismaRw, PrismaRo, Db],
  exports: [PrismaCore, PrismaRw, PrismaRo, Db],
})
export class DatabaseModule {}
