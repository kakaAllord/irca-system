import { Injectable, type OnModuleInit } from '@nestjs/common';
import { z } from 'zod';
import { AudienceRegistry } from '../../core/comms/audience.registry.js';

/**
 * The people Outreach reached, as an audience (08 step 8.7).
 *
 * Church-wide, so nobody but Communications may send to it until
 * Communications grants it to a department in Comms → Audiences. It is not
 * granted to Outreach by default (D22): someone spoken to once on a doorstep
 * did not ask to hear from the church, and whether they do is the church's
 * decision, not the team's. Those who said no on the doorstep are opted out,
 * and left alone like anyone else who is.
 */
@Injectable()
export class OutreachAudiences implements OnModuleInit {
  constructor(private readonly registry: AudienceRegistry) {}

  onModuleInit(): void {
    this.registry.register({
      key: 'outreach.reached',
      label: 'People Outreach reached',
      description:
        'Everyone the Outreach team recorded on a Saturday or since. Those who said no are left alone.',
      scope: 'church',
      params: z.object({}),
      describe: async () => 'People Outreach reached',
      resolve: async (tx) => {
        const rows = await tx.person.findMany({
          where: { outreachReached: { some: {} } },
          select: {
            id: true,
            fullName: true,
            dial: true,
            phone: true,
            lang: true,
            smsOptOut: true,
          },
          orderBy: { fullName: 'asc' },
        });
        return rows.map((p) => ({
          personId: p.id,
          name: p.fullName,
          dial: p.dial,
          phone: p.phone,
          lang: p.lang,
          optedOut: p.smsOptOut,
        }));
      },
    });
  }
}
