#!/usr/bin/env python3
import json
import sys


def _to_float(value):
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip().replace(',', '')
    if not text or text == '-':
        return None
    try:
        return float(text)
    except ValueError:
        return None


def _to_int(value):
    parsed = _to_float(value)
    if parsed is None:
        return None
    return int(parsed)


def _to_text(value):
    if value is None:
        return None
    text = str(value).strip()
    if not text or text == '-':
        return None
    return text


def main():
    try:
        import akshare as ak

        df = ak.stock_board_industry_summary_ths()
        records = []
        for _, row in df.iterrows():
            sector_name = _to_text(row.get('板块'))
            if not sector_name:
                continue

            records.append(
                {
                    'sectorName': sector_name,
                    'changePercent': _to_float(row.get('涨跌幅')),
                    'upCount': _to_int(row.get('上涨家数')),
                    'downCount': _to_int(row.get('下跌家数')),
                    'amount': _to_float(row.get('总成交额')),
                    'netInflow': _to_float(row.get('净流入')),
                    'leaderStock': _to_text(row.get('领涨股')),
                    'leaderLatestPrice': _to_float(row.get('领涨股-最新价')),
                    'leaderChangePercent': _to_float(row.get('领涨股-涨跌幅')),
                }
            )

        payload = {'source': 'akshare_ths', 'data': records}
        sys.stdout.write(json.dumps(payload, ensure_ascii=False))
        return 0
    except Exception as exc:  # pragma: no cover - runtime error path
        sys.stderr.write(f'akshare script failed: {exc}\n')
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
