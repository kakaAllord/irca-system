import { Module } from '@nestjs/common';
import { DepartmentsService } from './departments.service.js';
import { AdminDepartmentsController } from './admin-departments.controller.js';
import { DepartmentsController } from './departments.controller.js';

/**
 * The church's departments, their leaders and their members (D28). Exported,
 * because Communications asks it who leads what.
 */
@Module({
  controllers: [AdminDepartmentsController, DepartmentsController],
  providers: [DepartmentsService],
  exports: [DepartmentsService],
})
export class DepartmentsModule {}
