import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { ZodPipe } from '../../core/http/zod.pipe.js';
import { RequireAnyPermission, RequirePermission } from '../../core/rbac/decorators.js';
import { DepartmentsService } from './departments.service.js';

const MemberSchema = z.object({ personId: z.uuid() });

/**
 * A department as its leaders see it, and its members, which its leaders
 * keep. An administrator may use these too. Which department someone may
 * touch is the service's to check; these guards only say what kind of thing.
 */
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departments: DepartmentsService) {}

  @RequirePermission('departments.own.read')
  @Get('mine')
  mine() {
    return this.departments.mine();
  }

  @RequireAnyPermission('departments.own.read', 'admin.departments.read')
  @Get(':id')
  get(@Param('id') id: string) {
    return this.departments.get(id);
  }

  @RequireAnyPermission('departments.own.members', 'admin.departments.manage')
  @Get(':id/member-candidates')
  memberCandidates(@Param('id') id: string, @Query('q') q = '') {
    return this.departments.memberCandidates(id, q);
  }

  @RequireAnyPermission('departments.own.members', 'admin.departments.manage')
  @Post(':id/members')
  @HttpCode(201)
  addMember(@Param('id') id: string, @Body(new ZodPipe(MemberSchema)) body: { personId: string }) {
    return this.departments.addMember(id, body.personId);
  }

  @RequireAnyPermission('departments.own.members', 'admin.departments.manage')
  @Post(':id/members/:memberId/end')
  @HttpCode(204)
  endMember(@Param('id') id: string, @Param('memberId') memberId: string) {
    return this.departments.endMember(id, memberId);
  }
}
