import { Global, Module } from '@nestjs/common';
import { FilesService } from './files.service.js';
import { MemoryFileStorage } from './memory.storage.js';

/**
 * Files in object storage, for every module (D24). See FilesService for how
 * an upload becomes a file, and which storage is used when.
 */
@Global()
@Module({
  providers: [FilesService, MemoryFileStorage],
  exports: [FilesService, MemoryFileStorage],
})
export class FilesModule {}
