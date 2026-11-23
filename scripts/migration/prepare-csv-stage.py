"""Prepare bounded, repeatable staging SQL from CSVs without logging record values.

All cells, including empty strings, multiline text and literal NULL, are kept
exactly as parsed. This is recovery staging, not a complete Airtable export.
The output contains private records and must remain outside source control.
"""
import argparse
import csv
import hashlib
import json
from pathlib import Path
import uuid

TABLE_FILES = {
    "opportunities": "Opportunities-Grid view.csv",
    "settings": "Settings-Grid view.csv",
    "companies": "Companies-Grid view.csv",
    "contacts": "Contacts-Grid view.csv",
    "stories": "Stories-Grid view.csv",
    "watchlist": "Watchlist-Grid view.csv",
    "signals": "Signals-CSV export - all records.csv",
    "automation_runs": "Automation Runs-Grid view.csv",
    "source_boards": "Source Boards-Grid view.csv",
    "lead_inbox": "Lead Inbox-Grid view.csv",
}


def literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def json_literal(value):
    return literal(json.dumps(value, ensure_ascii=False, separators=(",", ":"))) + "::jsonb"


def read_csv(path):
    with path.open(encoding="utf-8-sig", newline="") as stream:
        reader = csv.reader(stream, strict=True)
        headers = next(reader)
        rows = list(reader)
    if not headers or len(set(headers)) != len(headers) or any(not h for h in headers):
        raise ValueError("CSV must have unique nonempty headers")
    if any(len(row) != len(headers) or not any(cell.strip() for cell in row) for row in rows):
        raise ValueError("CSV contains malformed or blank rows")
    return headers, rows


def prepare(source, output):
    output.mkdir(parents=True, exist_ok=True, mode=0o700)
    summary = {"phase": "csv_staging_only", "source_ids_complete": False,
               "comments_complete": False, "tables": [], "queries": []}
    query_index = 0

    def save_query(query):
        nonlocal query_index
        path = output / ("batch-%03d.sql" % query_index)
        path.write_text(query, encoding="utf-8")
        path.chmod(0o600)
        summary["queries"].append(str(path.resolve()))
        query_index += 1

    for table, filename in TABLE_FILES.items():
        path = source / filename
        raw = path.read_bytes()
        headers, rows = read_csv(path)
        digest = hashlib.sha256(raw).hexdigest()
        export_id = str(uuid.uuid5(uuid.NAMESPACE_URL, "waypoint-csv:" + table + ":" + digest))
        save_query("insert into waypoint_migration.csv_exports "
                   "(export_id,table_key,source_filename,file_sha256,file_bytes,headers,expected_rows) values (" +
                   ",".join([literal(export_id), literal(table), literal(filename), literal(digest),
                             str(len(raw)), json_literal(headers), str(len(rows))]) +
                   ") on conflict (export_id) do nothing;")
        batch = []
        batch_bytes = 0
        for number, row in enumerate(rows, 1):
            value = "(" + literal(export_id) + "," + str(number) + "," + json_literal(row) + ")"
            size = len(value.encode("utf-8"))
            if size > 900_000:
                raise ValueError("Single row exceeds the bounded SQL transfer limit")
            if batch and (batch_bytes + size > 450_000 or len(batch) >= 100):
                save_query("insert into waypoint_migration.csv_rows (export_id,row_number,cells) values " +
                           ",".join(batch) + " on conflict (export_id,row_number) do nothing;")
                batch, batch_bytes = [], 0
            batch.append(value)
            batch_bytes += size
        if batch:
            save_query("insert into waypoint_migration.csv_rows (export_id,row_number,cells) values " +
                       ",".join(batch) + " on conflict (export_id,row_number) do nothing;")
        summary["tables"].append({"table": table, "file": filename, "sha256": digest,
                                  "export_id": export_id, "rows": len(rows), "columns": len(headers),
                                  "bytes": len(raw)})
    target = output / "manifest.json"
    target.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    target.chmod(0o600)
    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    result = prepare(args.source, args.out)
    print(json.dumps({"tables": len(result["tables"]),
                      "rows": sum(t["rows"] for t in result["tables"]),
                      "batches": len(result["queries"]), "manifest": str(args.out / "manifest.json")}))
