import { Global, Module } from '@nestjs/common';
import { Db } from './db.service.js';
import { PrismaDb } from './prisma-clients.js';

@Global()
@Module({
  providers: [PrismaDb, Db],
  exports: [PrismaDb, Db],
})
export class DatabaseModule {}
