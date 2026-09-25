import { Global, Module } from '@nestjs/common';
import { Db } from './db.service.js';
import { PrismaDb, PrismaRo } from './prisma-clients.js';

@Global()
@Module({
  providers: [PrismaDb, PrismaRo, Db],
  exports: [PrismaDb, Db],
})
export class DatabaseModule {}
