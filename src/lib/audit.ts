/**
 * One line per destructive action, so "what happened to X" has an answer.
 *
 * This app has genuinely lost real data during development more than once —
 * see the git history — and the gap was the same every time: nothing recorded
 * what was removed, so afterwards there was no way to tell whether it was the
 * person themselves, a bug, or a stray script. A structured audit table would
 * be the complete answer, but the actually-missing piece was far cheaper: one
 * line naming who deleted what, right before it happens, so the next time
 * this question comes up `journalctl` can answer it instead of a shrug.
 *
 * Deliberately just console.log, not a database write — a table adds a
 * migration, a retention policy, and a reason to query it, for something that
 * exists to be grepped once in a while after the fact.
 */
export function logDeletion(actor: string, resource: string, detail: string): void {
  console.log(`[delete] ${resource} removed by ${actor}: ${detail}`);
}
