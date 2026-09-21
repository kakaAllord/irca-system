// pg 8.23 accepts enableChannelBinding on the pool config, but @types/pg 8.15
// does not declare it yet. Interface merging rather than a cast at the call
// site, so the option stays type-checked and this note has somewhere to live.
// Delete once @types/pg ships it.
import 'pg';

declare module 'pg' {
  interface PoolConfig {
    enableChannelBinding?: boolean;
  }
}
