# infra: Ask the library, edge rules

Terraform for the WAF rate limit, the `stacks-ask` AI Gateway and the Health Check
with its notification (`docs/spec/ask-the-library.md` S5, S8, S11). Not created
here: the Turnstile widget, which `pnpm turnstile` makes through Cloudflare's API so
its secret never enters Terraform state (S14 Q4, ADR-0135).

Pinned: Terraform `1.17.1`, `cloudflare/cloudflare` provider `5.28.1`
(`.terraform.lock.hcl` committed). State is local and never committed.

## What it holds

| Resource | Spec |
| --- | --- |
| `cloudflare_ruleset.ask_rate_limit` (zone, `http_ratelimit`) | `stacks.aymandiab.com`, path starting `/api/chat` ignoring case, any method, per IP and data centre (`cf.colo.id` and `ip.src`, which the API requires), 10 per 60 s, block 600 s |
| `cloudflare_ai_gateway.ask` (`stacks-ask`) | authentication on, logs off, cache off, spend limit 0.09 per day, sliding |
| `cloudflare_healthcheck.ask` | HTTPS GET `/api/chat/health`, expects 200, every 60 s, one region |
| `cloudflare_notification_policy.ask_health` | alerts on that check, to the sensitive `alert_recipient` variable |

`infra/` holds no email address (C16). The recipient is `var.alert_recipient`:
sensitive, no default.

## Token

One API token with an expiry, set only on the terraform command, never in `.env`.
Permissions, from the resources above (names per
<https://developers.cloudflare.com/fundamentals/api/reference/permissions/>; the
provider docs for each resource list the same groups):

- Zone > Zone WAF > Edit (rate limiting ruleset), scoped to the `aymandiab.com` zone
- Zone > Health Checks > Edit, same zone
- Account > AI Gateway > Edit (account-wide: Cloudflare cannot scope it to one gateway)
- Account > Notifications > Edit
- Zone > Zone > Read is not needed, because the zone id is passed in. The
  notification and gateway calls need the account id, also passed in.

The Cloudflare docs name write permissions "Edit" in some tables and "Write" in
others. If the first plan is refused for permissions, add the missing one from the
error and note it here. Whether Zone WAF Edit alone covers the `http_ratelimit`
entrypoint was not confirmable from Cloudflare's documentation; the first `terraform plan` shows it.

## Run

```sh
cd infra
export TF_VAR_account_id=...        # the account id
export TF_VAR_zone_id=...           # the aymandiab.com zone id
export TF_VAR_alert_recipient=...   # or an ignored terraform.tfvars
terraform init
CLOUDFLARE_API_TOKEN=... terraform plan  -out=ask.tfplan
CLOUDFLARE_API_TOKEN=... terraform apply ask.tfplan
```

`*.tfstate*`, `.terraform/`, `*.tfvars` and `*.tfplan` are ignored by the root
`.gitignore`. Docker works too: `docker run --rm -v "<abs path>:/work" -w /work
-e CLOUDFLARE_API_TOKEN -e TF_VAR_account_id ... hashicorp/terraform:1.17.1 plan`.

## Read the first plan before apply

The zone carries the root domain. A zone has one `http_ratelimit` entrypoint
ruleset and `cloudflare_ruleset` manages **all of it**: any existing rate limiting
rule on the zone would be removed by apply. The Pro plan allows 2 such rules, so the
plan must show this one rule created and no rule removed or changed. If it shows any
other change, stop and ask (S13). An existing entrypoint cannot be created twice, so
the first apply may instead need `terraform import` of the existing entrypoint
first; the plan or apply error says so.

## Way back

`terraform destroy` removes all four resources. Read the destroy plan first; it must
touch nothing outside `infra/`. Delete the Turnstile widget by hand, and make a new
one with `pnpm turnstile --create` once the Worker is redeployed.

## Open items (not verified live, nothing here has been applied)

- **Spend limit units.** The provider has `spend_limits` with `limit`, `limit_type =
  "cost"`, `window` and `technique`, but no document I could reach gives the unit of
  `limit` or `window`. Cloudflare's changelog says dollars; a third-party SDK says
  cents and seconds. The file uses `limit = 0.09`, `window = 86400` so a wrong unit
  fails closed. After apply, read the gateway back (C16) and, if the dashboard
  does not show $0.09 per day sliding, set it by hand and correct this file.
- **Spend limits and the Workers AI binding.** Cloudflare's changelog names only
  Unified Billing and BYOK requests, but an early check on 2026-11-05 (a temporary
  Worker, a test gateway with a $0.01 limit) saw a Worker's binding calls trip error
  2045 about 4% over the limit, and read the unit back as dollars and seconds. That
  was one gateway on one day: S12's after-build test on the deployed Worker still
  decides it, and if it does not trip there the owner hears first.
- **Gateway rate limit.** `rate_limiting_interval`/`rate_limiting_limit` are required
  by the schema and set to 0, which I read as off. Confirm in the plan or read-back.
- **Expression functions.** The rule uses `starts_with(lower(http.request.uri.path),
  "/api/chat")`. Pro rate limiting lists Path, Host and URI fields; whether
  `lower()` and `starts_with()` are accepted there is only known when the plan or
  apply runs. It does not catch `//api/chat` or percent-encoded paths.
- **Health Check interval.** 60 s is the Pro minimum per Cloudflare docs mirrors;
  the official page was not reachable. Probes pass through the WAF rule too, at 1
  per minute per probe IP, under the limit of 10.
- **The Terraform token is not the Turnstile token.** `pnpm turnstile` refuses to run
  while `CLOUDFLARE_API_TOKEN` is in the shell or an env file, so close the shell that
  held the Terraform token before it (S13 step 9). The widget needs its own short-lived
  token, typed at that script's prompt (`docs/commands.md`).
- **Secrets in shell history.** Read the token and recipient without echoing them (`read -rs CLOUDFLARE_API_TOKEN`, or `Read-Host -AsSecureString`) rather than typing them on a command line.
- **Destroy deletes the whole entrypoint.** The ruleset is the zone's one `http_ratelimit` entrypoint, root domain included: `terraform destroy` removes any rule added later by hand. Record the existing rules (S13 step 1) before the first plan.
- **`VISITOR_KEY`** is generated with a CSPRNG, for example 32 random bytes in hex, never typed.
- **Sensitive variable and state.** The recipient is kept out of every committed
  file, but it is stored in the local, ignored state file.
