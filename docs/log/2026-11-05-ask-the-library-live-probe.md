# The Ask the library live probe, and what the build changed

[#532](https://github.com/mephistopheles4/stacks/issues/532). On 2026-11-05 a
throwaway Worker, `stacks-spike-routes`, was deployed to the two exact routes on
the live hostname with the owner's yes, locked to a request header, with no
bindings and no AI call, and deleted afterwards. The results are in
`docs/spec/ask-the-library.md` S12.

- **An exact route matches the bare path only.** `/api/chat?x=1`, `/api/chat/`,
  `/api/chat/x`, `/api/chat/health?a=1` and `/API/chat` all fell through to
  Pages and answered 200 with the home page. The Worker therefore never reads a
  query string, and the WAF rule has to cover those variants too.
- **No zone challenge on the Worker's own fetch** of `/library.json`, and the
  prompt build took 1 to 5 ms of CPU against Workers Free's 10.
- **A finding was wrong and was corrected the same day.** The first record said
  `library.json` had no Thoughts mark. It has: `thoughts: true`. The cause was
  reading two books and not the schema.

What the build found beyond the spec:

- Cloudflare's published Turnstile test secret answers with a made-up hostname
  and no action, so a Worker whose own origin is localhost checks the verdict
  alone. Production's origin is not localhost.
- G38 admits only declared or excluded source directories, so `packages/ask/src`
  and `packages/site/src/ask` are excluded by decision until a first full
  mutation run can set a floor.
- The infrastructure code (`infra/`) pins the cloudflare provider and could not
  confirm that AI Gateway's spend limit counts a Worker binding's calls: the
  provider's changelog names only Unified Billing and BYOK requests. C7 decides.
