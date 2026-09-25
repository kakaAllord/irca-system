import { Global, Module } from '@nestjs/common';
import { FilesService } from './files.service.js';

/**
 * Files on a disk that outlives deploys, for every module (D24). See
 * FilesService for how an upload becomes a file, and where it is kept.
 */
@Global()
@Module({
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
