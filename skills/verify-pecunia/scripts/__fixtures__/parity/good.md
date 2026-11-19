# Parity fixture: a good page

## Old app inventory

| Old place  | Kind |
| ---------- | ---- |
| route: one | page |
| route: two | page |

## Behaviour

| Behaviour | Old place | Status | Where |
| --- | --- | --- | --- |
| A behaviour this app already has | route: one | built | capability:listBankLines |
| A behaviour this app reaches from the command line | route: one | built | command:mcp |
| A behaviour kept in the auth package | route: one | built | file:packages/auth/src/current-person.ts |
| A behaviour with a ticket | route: two | planned | ticket:SOFT-2395 |
| A behaviour with no ticket yet | route: two | planned | no ticket yet |
| A behaviour the new app will not carry over | route: two | dropped | it only served a handshake the new bank adapter owns, and no page ever showed it |
