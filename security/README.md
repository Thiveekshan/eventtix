# Security exceptions

The pipeline's Security stage fails on any **HIGH or CRITICAL** finding that has a fix available.
If a finding cannot be fixed (or is a false positive for this project), it can be accepted
**here, in writing**, and the pipeline lists it in every report.

Every entry needs a reason and an expiry date, so exceptions are reviewed and never forgotten.
An expired entry stops applying and the finding blocks the pipeline again.

```json
{
  "accepted": [
    {
      "id": "CVE-2026-12345",
      "package": "example-lib",
      "reason": "The vulnerable function is never called by EventTix.",
      "mitigation": "Input to this library is validated before use. Revisit when a fix is released.",
      "expires": "2026-12-31"
    }
  ]
}
```

| Field        | Required | Meaning                                                          |
| ------------ | -------- | ---------------------------------------------------------------- |
| `id`         | yes      | CVE / GHSA / Trivy rule id exactly as shown in the report        |
| `reason`     | yes      | Why this is acceptable (false positive, not reachable, no fix)   |
| `expires`    | yes      | `YYYY-MM-DD`: after this date the exception no longer applies    |
| `mitigation` | no       | What reduces the risk in the meantime                            |
| `package`    | no       | Limits the exception to one package                              |
