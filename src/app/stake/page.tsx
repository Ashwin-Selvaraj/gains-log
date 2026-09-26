import Link from 'next/link';
import { StakedGoals } from '@/components/StakedGoals';
import { chainConfigured, chainName } from '@/lib/chain/config';

export const metadata = { title: 'Staked goals' };

/**
 * A page of its own, reached from the account menu.
 *
 * Deliberately not a section on Today. Today is already the screen that is hard
 * to explain, and staking is an occasional action — you set a goal, then do not
 * touch it for a month — which is exactly the kind of thing that should not sit
 * between you and logging a set.
 */
export default function StakePage() {
  return (
    <>
      <header className="mb-4">
        <Link href="/" className="text-sm text-muted">
          ← Today
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Staked goals</h1>
        <p className="text-sm text-muted">
          Put tokens behind a goal. Your own logs decide whether you met it.
        </p>
      </header>

      {chainConfigured ? (
        <StakedGoals />
      ) : (
        <section className="card space-y-2">
          <p className="text-sm font-medium">Staking isn&apos;t switched on</p>
          <p className="text-sm text-muted">
            The contract addresses aren&apos;t set on this deployment, so there&apos;s
            nothing to stake against. Deploy the contracts in{' '}
            <code className="rounded bg-line/60 px-1">contracts/</code> and add the
            <code className="rounded bg-line/60 px-1">NEXT_PUBLIC_*</code> addresses the
            deploy script prints.
          </p>
          <p className="text-xs text-muted">
            Everything else in the app works without this — it&apos;s entirely optional.
          </p>
        </section>
      )}
    </>
  );
}
