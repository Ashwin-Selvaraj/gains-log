import { redirect } from 'next/navigation';

/** The feature's old address, kept so bookmarks and the installed PWA don't 404. */
export default function StakePage() {
  redirect('/pledges');
}
