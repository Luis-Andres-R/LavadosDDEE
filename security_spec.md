# Security Specification - Control de Lavados DDEE

## Data Invariants
1. A user profile (`/users/{uid}`) must have a valid role ('admin' or 'operator').
2. Only admins can create/update/delete `defaultWashings` and `washingPrograms`.
3. Operators can only create/update `washingRecords` for programs that exist and are not closed.
4. `washingRecords` must strictly follow the calculated logic: `completed + pending == programmedQuantity`.
5. Timestamps like `createdAt` and `updatedAt` must match `request.time`.
6. Users cannot change their own roles in `/users/{uid}`.
7. Deleting programs is restricted to admins.

## The Dirty Dozen Payloads (Target: DENIED)
1. **Identity Spoofing**: Operator trying to update their role to 'admin' in `/users/{uid}`.
2. **Access Escalation**: Operator trying to create a `washingProgram`.
3. **Data Poisoning**: Creating a `washingProgram` with `programmedQuantity` as a 2MB string.
4. **Relational Bypass**: Creating a `washingRecord` for a non-existent `programId`.
5. **Update Gap**: Updating a `washingRecord` without including `updatedAt`.
6. **State Shortcut**: Operator trying to reopen a `closed: true` program.
7. **Shadow Update**: Adding a field `isAdmin: true` to a `washingRecord`.
8. **PII Breach**: Unauthenticated user trying to read `/users`.
9. **Timestamp Fraud**: Setting `createdAt` to a date in the past instead of `request.time`.
10. **Orphaned Write**: Creating a `washingRecord` with a different `programmedQuantity` than the original program.
11. **Total System Bypass**: Trying to delete the entire `washingPrograms` collection via a batch query.
12. **Correction Injection**: Updating a closed program's record.

## Test Strategy
We will implement `firestore.rules.test.ts` using the Firebase Rules Emulator (conceptually, though here we will focus on robust rules construction).
