import { NextResponse } from 'next/server';
import { isAddress, getAddress } from 'viem';
import { prisma } from '@/lib/prisma';
import { requireUser, unauthorized } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Binds a wallet address to the signed-in account.
 *
 * Deliberately not an authentication step. Signing in stays Google-only, so
 * nobody has to own a wallet to log a workout — this is an attachment to an
 * account that already exists.
 *
 * What it therefore does *not* prove is control of the address: no signature is
 * checked here, so this says "this account claims this address", not "this
 * account holds its key". That is enough for what it is used for, because the
 * chain is the authority on whose stake is whose — GoalManager only ever pays a
 * stake back to the address that placed it, whatever this row says. If this
 * link were ever used to release funds, it would need a signed message first.
 */
export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return unauthorized();

  const body = (await req.json()) as { address?: unknown };
  const raw = String(body.address ?? '').trim();

  if (!isAddress(raw)) {
    return NextResponse.json({ error: 'That is not a valid address.' }, { status: 400 });
  }

  // Stored lowercased so a lookup never misses on checksum casing; returned
  // checksummed, which is the form a wallet displays.
  const address = raw.toLowerCase();

  const taken = await prisma.user.findUnique({
    where: { walletAddress: address },
    select: { id: true },
  });
  if (taken && taken.id !== user.id) {
    return NextResponse.json(
      { error: 'That wallet is already linked to another account.' },
      { status: 409 },
    );
  }

  await prisma.user.update({ where: { id: user.id }, data: { walletAddress: address } });
  return NextResponse.json({ address: getAddress(address) });
}

/** Unlinks. The goals themselves are on-chain and are untouched by this. */
export async function DELETE() {
  const user = await requireUser();
  if (!user) return unauthorized();
  await prisma.user.update({ where: { id: user.id }, data: { walletAddress: null } });
  return NextResponse.json({ address: null });
}

export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();
  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { walletAddress: true },
  });
  return NextResponse.json({
    address: row?.walletAddress ? getAddress(row.walletAddress) : null,
  });
}
