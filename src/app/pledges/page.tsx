import { Pledges } from '@/components/pledges/Pledges';
import { chainConfigured } from '@/lib/chain/config';

export const metadata = { title: 'Pledges' };

/**
 * Its own tab, rather than a page off the account menu: a pledge you can't
 * see is a pledge you forget, and forgetting it is the one way this feature
 * stops working. It still stays off Today — logging a set shouldn't have to
 * scroll past a wallet.
 */
export default function PledgesPage() {
  return (
    <>
      <header className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight">Pledges</h1>
        <p className="text-sm text-muted">Back your goals with GAINS tokens. Your own logs decide who wins.</p>
      </header>

      {chainConfigured ? (
        <Pledges />
      ) : (
        <section className="card space-y-2">
          <p className="text-sm font-medium">Pledges aren&apos;t switched on here</p>
          <p className="text-sm text-muted">
            This deployment has no contract addresses configured. Everything else in the app works
            without them.
          </p>
        </section>
      )}
    </>
  );
}
