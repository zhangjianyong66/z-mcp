# Debug Log Template

仅在 `debug.enabled=true` 时使用。本模板用于统一记录执行证据，默认不开启。

## 1) Flow (`debug/flow.md`)

- `run_id`:
- `debug_enabled`: true
- `trigger_keyword`:
- `start_time`:
- `end_time`:
- `final_status`: `success|failed|aborted`

### Timeline

| step | started_at | ended_at | status | note |
|---|---|---|---|---|
| Step 0 Bootstrap |  |  |  |  |
| Step 1 Input Guard |  |  |  |  |
| Step 2 Load Universe |  |  |  |  |
| Step 2.5 Integrity Gate |  |  |  |  |
| Step 3 Batch Decide |  |  |  |  |
| Step 3.5 Coverage Audit |  |  |  |  |
| Step 4 Parse Payload |  |  |  |  |
| Step 5 Projection |  |  |  |  |
| Step 6 Render |  |  |  |  |
| Step 7 Finalize |  |  |  |  |

## 2) Tool Calls (`debug/tool_calls_debug.json`)

每次工具调用记录对象建议结构：

```json
{
  "step": "Step 3 Batch Decide",
  "toolName": "stock-data__etf_batch_decide",
  "request": {},
  "response": {},
  "error": null,
  "durationMs": 0,
  "timestamp": "2026-05-06T00:00:00.000Z"
}
```

## 3) Issue (`debug/issue.md`)

- `problem_statement`:
- `observed_error`:
- `impact`:
- `root_cause_hypothesis`:
- `output_summary`:

### Artifact Index

- `manifest.json`:
- `input.json`:
- `preflight_check.json`:
- `tool_calls.json`:
- `tool_results.json`:
- `coverage_report.json`:
- `scoring.json`:
- `final_output.md`:
- `failure_ledger.json`:
- `debug/flow.md`:
- `debug/tool_calls_debug.json`:
- `debug/issue.md`:
