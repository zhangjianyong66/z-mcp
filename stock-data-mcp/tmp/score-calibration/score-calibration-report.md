# Score Calibration Report

- GeneratedAt: 2026-05-07T04:57:44.388Z
- Sample: 39 ETFs, days=60

## A: v1 baseline
- total p50: 34.807, p75: 40, >=70: 0%
- low-score(<50): 97.06%
- actionCounts: {"no_trade":29,"hold_watch":5}

## C: v2 with v1 rr (non-RR delta isolator)
- total p50: 44, p75: 49, >=70: 0%
- low-score(<50): 87.18%
- actionCounts: {"no_trade":33,"hold_watch":6}

## B: v2 balanced (full change)
- total p50: 59, p75: 62.635, >=70: 7.69%
- low-score(<50): 12.82%
- actionCounts: {"hold_watch":9,"no_trade":28,"open_buy":2}

## Delta
- non-RR(C-A): p50=9.193, p75=9, >=70=0%, <50=-9.88%
- RR-only(B-C): p50=15, p75=13.635, >=70=7.69%, <50=-74.36%
- total(B-A): p50=24.193, p75=22.635, >=70=7.69%, <50=-84.24%