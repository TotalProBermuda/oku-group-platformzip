/** Compare contact input with the authenticated account; never infer ownership from input. */
export function checkoutEmailsMatch(accountEmail: string | null | undefined, enteredEmail: string) {
  return Boolean(accountEmail?.trim()) && accountEmail!.trim().toLowerCase() === enteredEmail.trim().toLowerCase();
}
