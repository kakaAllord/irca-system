import { Injectable, type OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import { AudienceRegistry } from '../../core/comms/audience.registry.js';

/**
 * Everyone who can sign in. Staff are texted too, and may turn it off on
 * their Account page. A staff account that belongs to a person is reached on
 * the number and in the language People holds for them, which is kept up to
 * date; otherwise on the account's own number, in English, as the portal is.
 */
@Injectable()
export class StaffAudience implements OnModuleInit {
  constructor(private readonly registry: AudienceRegistry) {}

  onModuleInit(): void {
    this.registry.register({
      key: 'church.staff',
      label: 'Staff',
      description: 'Everyone who can sign in to the system.',
      scope: 'church',
      params: z.object({}),
      describe: async () => 'Staff',
      resolve: async (tx) => {
        const users = await tx.user.findMany({
          where: { status: 'ACTIVE' },
          include: { person: true },
          orderBy: { fullName: 'asc' },
        });
        return users.map((u) => ({
          userId: u.id,
          personId: u.person?.id,
          name: u.fullName,
          dial: u.person?.phone ? u.person.dial : '+255',
          phone: u.person?.phone || u.phone || '',
          lang: u.person?.lang ?? 'en',
          optedOut: u.smsOptOut || (u.person?.smsOptOut ?? false),
        }));
      },
    });
  }
}
