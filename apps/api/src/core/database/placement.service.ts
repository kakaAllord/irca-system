import { Injectable } from '@nestjs/common';
import { PrismaCore } from './prisma-clients.js';

type Placement = { cluster: string; state: 'ACTIVE' | 'MOVING' };

const CACHE_MS = 30_000;

/**
 * Where a church's records live, and whether they are being moved.
 *
 * Today every church is in the one shared database, so this answers the same
 * thing for everyone. It exists now because the alternative is retrofitting a
 * lookup into every request later (docs/plan/multi-tenancy.md, section 13),
 * and because the MOVING state is what pauses a church's writes during a move.
 */
@Injectable()
export class PlacementService {
  private readonly cache = new Map<string, { at: number; placement: Placement }>();

  constructor(private readonly db: PrismaCore) {}

  async forChurch(churchId: string): Promise<Placement> {
    const hit = this.cache.get(churchId);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.placement;

    const row = await this.db.churchPlacement.findUnique({ where: { churchId } });
    const placement: Placement = {
      cluster: row?.cluster ?? 'shared',
      state: row?.state ?? 'ACTIVE',
    };
    this.cache.set(churchId, { at: Date.now(), placement });
    return placement;
  }

  /** Called when a placement changes, so the next request sees it at once. */
  forget(churchId: string): void {
    this.cache.delete(churchId);
  }

  /** Every cluster holding church records. Jobs that scan everything loop over these. */
  clusters(): string[] {
    return ['shared'];
  }
}
