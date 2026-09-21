import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { PASSWORD_MAX } from '@irca/shared';
import { ZodPipe } from '../../core/http/zod.pipe.js';
import { RequirePermission } from '../../core/rbac/decorators.js';
import { InvitationService } from '../../core/invitations/invitation.service.js';
import { PeopleService } from './people.service.js';

const ListSchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(['ACTIVE', 'INVITED', 'DISABLED']).optional(),
  roleId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

const InviteSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  fullName: z.string().trim().min(2).max(120),
  roleIds: z.array(z.uuid()).min(1, 'Choose at least one role').max(20),
});

const RolesSchema = z.object({ roleIds: z.array(z.uuid()).max(20) });
const EnabledSchema = z.object({ enabled: z.boolean() });

// Unused here, but it keeps the password rules in one place for the portal.
void PASSWORD_MAX;

@Controller('admin/users')
export class PeopleController {
  constructor(
    private readonly people: PeopleService,
    private readonly invitations: InvitationService,
  ) {}

  @RequirePermission('admin.users.read')
  @Get()
  list(@Query(new ZodPipe(ListSchema)) query: z.infer<typeof ListSchema>) {
    return this.people.list(query);
  }

  @RequirePermission('admin.users.read')
  @Get(':userId')
  get(@Param('userId') userId: string) {
    return this.people.get(userId);
  }

  @RequirePermission('admin.users.invite')
  @Post('invitations')
  @HttpCode(201)
  invite(@Body(new ZodPipe(InviteSchema)) body: z.infer<typeof InviteSchema>) {
    return this.invitations.invite(body);
  }

  @RequirePermission('admin.users.invite')
  @Post(':userId/invitation/resend')
  @HttpCode(204)
  resend(@Param('userId') userId: string) {
    return this.invitations.resend(userId);
  }

  @RequirePermission('admin.users.invite')
  @Delete(':userId/invitation')
  @HttpCode(204)
  cancel(@Param('userId') userId: string) {
    return this.invitations.revoke(userId);
  }

  @RequirePermission('admin.users.manage')
  @Put(':userId/roles')
  @HttpCode(204)
  setRoles(
    @Param('userId') userId: string,
    @Body(new ZodPipe(RolesSchema)) body: { roleIds: string[] },
  ) {
    return this.people.setRoles(userId, body.roleIds);
  }

  @RequirePermission('admin.users.manage')
  @Put(':userId/access')
  @HttpCode(204)
  setAccess(
    @Param('userId') userId: string,
    @Body(new ZodPipe(EnabledSchema)) body: { enabled: boolean },
  ) {
    return this.people.setEnabled(userId, body.enabled);
  }
}
