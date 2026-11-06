# Ask the library: edge protection and monitoring (docs/spec/ask-the-library.md S5, S8, S11).
# Nothing here creates the Turnstile widget; the owner does that by hand (S14 Q4).

terraform {
  required_version = "= 1.17.1"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "= 5.28.1"
    }
  }
}

# Credentials come from the CLOUDFLARE_API_TOKEN environment variable, set on
# the terraform command only (README.md). Nothing is configured here.
provider "cloudflare" {}

variable "account_id" {
  type        = string
  description = "Cloudflare account id. Pass as TF_VAR_account_id; never hard-coded."
}

variable "zone_id" {
  type        = string
  description = "Zone id of aymandiab.com. Pass as TF_VAR_zone_id."
}

variable "alert_recipient" {
  type        = string
  sensitive   = true
  description = "Where Health Check alerts are sent. Pass as TF_VAR_alert_recipient or an ignored .tfvars; never committed (C16)."
  # No default, on purpose.
}

locals {
  host = "stacks.aymandiab.com"
}

# 1. WAF rate limit (S5 step 1).
# Docs: https://registry.terraform.io/providers/cloudflare/cloudflare/5.28.1/docs/resources/ruleset
#       https://developers.cloudflare.com/waf/rate-limiting-rules/  (Pro limits)
#
# WARNING: a zone has ONE http_ratelimit entrypoint ruleset. This resource
# manages that whole entrypoint, so applying it replaces every other rate
# limiting rule the zone has (the root domain shares the zone). Read the first
# plan for any rule it would remove before apply (README.md).
#
# Pro-plan fit (checked against the docs above): characteristics cf.colo.id and
# ip.src (the API requires cf.colo.id, so a count is per address per data centre), period
# 60 s allowed, mitigation timeout 600 s allowed (Pro takes the supported values up to 1 h), counting_expression not
# available (so none is set), 2 rate-limit rules per zone (this uses 1).
# Numbers are the spec's, unchanged.
#
# The expression: an exact Worker route catches only the bare path (S12), so the
# rule matches anything starting with /api/chat, case-insensitively, which
# covers /api/chat?x=1, /api/chat/, /api/chat/x and /API/chat. It also matches
# /api/chat/health. Every method is covered because no method is tested.
# Unverified until the plan: whether lower() and starts_with() are accepted in a
# Pro rate-limiting expression. If the API refuses them, plan/apply fails and
# the owner decides; nothing is silently loosened.
resource "cloudflare_ruleset" "ask_rate_limit" {
  zone_id     = var.zone_id
  name        = "stacks-ask rate limit"
  description = "Ask the library: /api/chat* per IP, 10 per 60 s, block 10 min"
  kind        = "zone"
  phase       = "http_ratelimit"

  rules = [{
    action      = "block"
    description = "Ask the library, per IP"
    enabled     = true
    expression  = "http.host eq \"${local.host}\" and starts_with(lower(http.request.uri.path), \"/api/chat\")"
    ratelimit = {
      characteristics     = ["cf.colo.id", "ip.src"]
      period              = 60
      requests_per_period = 10
      mitigation_timeout  = 600
    }
  }]
}

# 2. AI Gateway (S5 step 5).
# Docs: https://registry.terraform.io/providers/cloudflare/cloudflare/5.28.1/docs/resources/ai_gateway
#       https://developers.cloudflare.com/ai-gateway/features/spend-limits/
#
# authentication on, logging off (collect_logs false), cache off (cache_ttl 0).
# cache_ttl, cache_invalidate_on_update, collect_logs and the rate_limiting_*
# arguments are required by the schema. The gateway's own request rate limit is
# not part of the spec, so interval and limit are 0, which I read as "off";
# that reading is unverified, so the plan and read-back must be checked
# (README.md "Open items").
#
# spend_limits: the provider schema HAS the block (enabled, rules[] with limit,
# limit_type "cost", window, technique). What is NOT documented anywhere I could
# reach is the unit of `limit` and `window`: Cloudflare's changelog says
# "dollars"; a third-party SDK says cents and seconds. Chosen so a wrong unit
# fails SAFE: limit 0.09, window 86400. If the unit is cents this is 0.09 cent
# and blocks almost every call, which is loud, not a leak. The read-back after
# apply (C16) must show $0.09 per day, sliding; fix the number then.
# Measured 2026-11-05 (S12, early results): a gateway limit of 0.01 over 86400 s,
# sliding, read back as "cost limit 0.01 per 86400s", so the unit is dollars and
# seconds, and calls through a Worker's AI binding with the gateway option did trip
# it with error 2045. The changelog names only Unified Billing and BYOK requests,
# so this is one gateway on one day: C7 on the deployed Worker still decides.
resource "cloudflare_ai_gateway" "ask" {
  account_id = var.account_id
  id         = "stacks-ask"

  authentication = true
  collect_logs   = false

  cache_ttl                  = 0
  cache_invalidate_on_update = false

  rate_limiting_interval  = 0
  rate_limiting_limit     = 0
  rate_limiting_technique = "sliding"

  spend_limits = {
    enabled = true
    rules = [{
      enabled    = true
      limit      = 0.09
      limit_type = "cost"
      window     = 86400
      technique  = "sliding"
    }]
  }
}

# 3. Health Check (S5, S11).
# Docs: https://registry.terraform.io/providers/cloudflare/cloudflare/5.28.1/docs/resources/healthcheck
#
# Interval 60 s is the Pro minimum (from Cloudflare docs mirrors; the official
# page was not reachable). One region keeps the probe rate far under the WAF's
# 10 per 60 s per IP. The rate-limit rule also covers this path, so the probe
# is counted by it like any caller; whether a Health Check reaches a Worker
# route at all is S12's test.
resource "cloudflare_healthcheck" "ask" {
  zone_id     = var.zone_id
  name        = "stacks-ask-health"
  description = "Ask the library: GET /api/chat/health must return 200"
  address     = local.host
  type        = "HTTPS"

  interval              = 60
  retries               = 1
  timeout               = 5
  consecutive_fails     = 2
  consecutive_successes = 1
  check_regions         = ["WNAM"]

  http_config = {
    method           = "GET"
    path             = "/api/chat/health"
    port             = 443
    expected_codes   = ["200"]
    follow_redirects = false
    allow_insecure   = false
    header = {
      Host = [local.host]
    }
  }
}

# Docs: https://registry.terraform.io/providers/cloudflare/cloudflare/5.28.1/docs/resources/notification_policy
# The destination is the sensitive variable only (C16: infra/ holds no address).
resource "cloudflare_notification_policy" "ask_health" {
  account_id  = var.account_id
  name        = "stacks-ask health"
  description = "Ask the library health check changed status"
  alert_type  = "health_check_status_notification"
  enabled     = true

  # The alert type requires a status filter: API error 17103 without one (2026-11-06, #549).
  filters = {
    health_check_id = [cloudflare_healthcheck.ask.id]
    status          = ["Healthy", "Unhealthy"]
  }

  mechanisms = {
    email = [{ id = var.alert_recipient }]
  }
}
