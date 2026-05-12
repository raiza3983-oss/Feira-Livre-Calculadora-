# Security Specification - Feira Livre Calculadora

## 1. Data Invariants
- A `Shop` must have a valid `ownerUid`.
- Only the owner of a `Shop` can update its data.
- User profiles are private; only the owner can read/write their own profile.
- Shop types are restricted to a specific enum.

## 2. Dirty Dozen Payloads (Rejection Tests)
1. **Identity Spoofing**: Attempt to create a shop with `ownerUid` that isn't the caller's UID.
2. **Type Poisoning**: Set shop `type` to "supermarket" (not in enum).
3. **Ghost Field**: Add `isVerified: true` to a shop update.
4. **Unauthorized Update**: User A attempts to update User B's shop.
5. **Unauthorized Read**: User A attempts to read User B's private profile.
6. **ID Poisoning**: Attempt to use a 1KB string as a shop ID.
7. **Negative Price**: (If processing orders) Attempt to set a negative price.
8. **Resource Exhaustion**: Send a 1MB string in the shop `name`.
9. **Missing Required Field**: Create a shop without `type`.
10. **Role Escalation**: User attempts to change their own role from 'customer' to 'vendor' in someone else's profile? No, in their own profile if not allowed.
11. **Metadata Tampering**: Attempt to modify `createdAt` on update.
12. **Blanket Query**: Attempt to list all shops without a filter (if restricted).

## 3. Planned Rules Logic
- `isValidShop()`: Checks `ownerUid` matches `auth.uid`, checks types and field sizes.
- `shops` collection:
  - `read`: Any signed-in user? Or just owner? For a market, maybe anyone can read shops.
  - `write`: Only owner.
- `users` collection:
  - `read/write`: Only owner.
