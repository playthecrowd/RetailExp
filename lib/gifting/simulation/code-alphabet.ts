/**
 * The characters a gift code can contain.
 *
 * WHY IT IS SHORT
 *   These codes get read off a printed card, over a phone, or across a shop
 *   counter. 0/O, 1/I/L, 5/S, 8/B and 2/Z are the pairs people confuse when
 *   doing that, so none of them are here. What is left is unambiguous when
 *   spoken and unambiguous when typed.
 *
 * WHY IT LIVES ON ITS OWN
 *   The generator uses it, the validator uses it, and now the on-screen
 *   keyboard draws its keys from it — a keyboard offering a character the
 *   generator never produces would be a lie, and one missing a character it
 *   does produce would be a trap. One list, three consumers.
 */
export const CODE_ALPHABET = "234679ACDEFGHJKMNPQRTUVWXYZ";

/** Codes are printed as two groups of five. */
export const CODE_GROUP = 5;
export const CODE_GROUPS = 2;
export const CODE_MAX_LENGTH = CODE_GROUP * CODE_GROUPS + (CODE_GROUPS - 1);

/** Keeps only supported characters, uppercases, and re-groups with hyphens.
 *  Anything already typed that does not belong is dropped rather than
 *  rejected, so a paste of "kq7mw 3tdhf" arrives as "KQ7MW-3TDHF". */
export function formatCode(raw: string): string {
  const kept = raw
    .toUpperCase()
    .split("")
    .filter((c) => CODE_ALPHABET.includes(c))
    .slice(0, CODE_GROUP * CODE_GROUPS)
    .join("");
  const groups: string[] = [];
  for (let i = 0; i < kept.length; i += CODE_GROUP) groups.push(kept.slice(i, i + CODE_GROUP));
  return groups.join("-");
}
