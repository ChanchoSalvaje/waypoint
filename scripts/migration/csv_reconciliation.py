"""Reconcile CSV cells with UI-verified field/record IDs, without inventing IDs.

Raw CSV cells remain in staging. Original creation times and sub-minute timestamp
precision are unavailable in CSV and are never inferred from import time.
"""
import argparse
import base64
import collections
import csv
from datetime import datetime
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import re
import secrets
import pgpy
from pgpy.constants import CompressionAlgorithm, SymmetricKeyAlgorithm

LINK_PAIRS = [
    ("opportunities", "Companies", "companies", "Opportunities"),
    ("opportunities", "Contacts", "contacts", "Opportunities"),
    ("opportunities", "Stories", "stories", "Related Roles"),
    ("contacts", "Company", "companies", "Contacts"),
]


def multi_values(value):
    return next(csv.reader([value], strict=True)) if value else []


def resolve_links(tables, identities, pairs=LINK_PAIRS):
    resolved = {}
    for a, af, b, bf in pairs:
        for source, field, target, inverse in [(a, af, b, bf), (b, bf, a, af)]:
            target_index = collections.defaultdict(list)
            for number, row in enumerate(tables[target], 1):
                target_index[next(iter(row.values()))].append(number)
            for number, row in enumerate(tables[source], 1):
                primary = next(iter(row.values()))
                values = multi_values(row[field])
                picked = []
                for name in dict.fromkeys(values):
                    candidates = target_index.get(name, [])
                    if len(candidates) > 1:
                        candidates = [n for n in candidates
                                      if primary in multi_values(tables[target][n - 1][inverse])]
                    # Repeated identical labels may represent several different
                    # records. Only accept them when multiplicity and backlinks agree.
                    if len(candidates) != values.count(name) or not candidates:
                        raise ValueError(f"Unresolved relationship: {source} row {number}, {field}")
                    picked.extend(identities[target][str(n)]["id"] for n in candidates)
                resolved[(source, number, field)] = picked
    # Every reconstructed relationship must exist in both directions.
    for a, af, b, bf in pairs:
        for number, row in enumerate(tables[a], 1):
            source_id = identities[a][str(number)]["id"]
            for target_id in resolved[(a, number, af)]:
                target_number = next(n for n, identity in identities[b].items()
                                     if identity["id"] == target_id)
                if source_id not in resolved[(b, int(target_number), bf)]:
                    raise ValueError("Relationship has no reciprocal source link")
    return resolved


def convert_cell(value, display_type, options=None):
    options = options or {}
    if display_type == "Checkbox":
        if value not in ("", "checked"):
            raise ValueError("Unsupported checkbox export value")
        return value == "checked"
    if display_type == "Number":
        if not value:
            return None
        number = Decimal(value)
        if not number.is_finite():
            raise ValueError("Non-finite numeric value")
        return int(number) if number == number.to_integral_value() else float(number)
    if display_type == "Multiple select":
        return multi_values(value)
    if display_type == "Attachment":
        if value:
            raise ValueError("Attachment files require separate recovery")
        return []
    if display_type == "User":
        if value:
            raise ValueError("Populated collaborator values require identity reconciliation")
        return None
    if display_type == "Date":
        if not value:
            return None
        if re.fullmatch(r"\d{4}-\d{2}-\d{2} \d{2}:\d{2}", value):
            if options.get("timezone") != "GMT/UTC" or options.get("precision") != "minute":
                raise ValueError("Timestamp timezone and precision must be source-verified")
            return datetime.strptime(value, "%Y-%m-%d %H:%M").isoformat(timespec="seconds") + "Z"
        for pattern in ("%Y-%m-%d", "%m/%d/%Y"):
            try:
                return datetime.strptime(value, pattern).date().isoformat()
            except ValueError:
                pass
        raise ValueError("Unsupported date format")
    return value


def literal(value):
    return "'" + value.replace("'", "''") + "'"


def bounded_insert(table, columns, rows):
    """Decode only JSON data: table/column names are caller-owned constants."""
    password = secrets.token_hex(16)
    message = pgpy.PGPMessage.new(json.dumps(rows, ensure_ascii=False, separators=(",", ":")),
                                 compression=CompressionAlgorithm.ZIP)
    encoded = base64.b64encode(bytes(message.encrypt(password, cipher=SymmetricKeyAlgorithm.AES256))).decode()
    expressions = ",".join(expression for _, expression in columns)
    names = ",".join(name for name, _ in columns)
    sql = ("with payload as (select convert_from(extensions.pgp_sym_decrypt_bytea(decode(" +
           literal(encoded) + ",'base64')," + literal(password) + "),'UTF8')::jsonb as data), " +
           f"inserted as (insert into waypoint_migration.{table}({names}) select {expressions} " +
           "from payload,jsonb_array_elements(data) r on conflict do nothing returning 1) " +
           "select count(*)::integer as inserted_rows from inserted;")
    if len(sql.encode()) > 60_000:
        raise ValueError("Reconciliation batch exceeds the request limit")
    return sql


def prepare(source, checkpoint, output):
    manifest = json.loads((checkpoint / "csv-stage/manifest.json").read_text())
    metadata = json.loads((checkpoint / "source-metadata.json").read_text())
    identities = json.loads((checkpoint / "source-identity.json").read_text())
    tables = {}
    for table in manifest["tables"]:
        with (source / table["file"]).open(encoding="utf-8-sig", newline="") as stream:
            reader = csv.DictReader(stream)
            tables[table["table"]] = list(reader)
            fields = metadata["fields"][table["table"]]
            if reader.fieldnames != [field["name"] for field in fields]:
                raise ValueError("CSV and source field definitions differ")
        rows = tables[table["table"]]
        mapped = identities[table["table"]]
        if len(mapped) != len(rows) or len({item["id"] for item in mapped.values()}) != len(rows):
            raise ValueError("Incomplete or duplicate original IDs")
        if any(mapped[str(n)]["primary"] != next(iter(row.values())) for n, row in enumerate(rows, 1)):
            raise ValueError("Record ID does not match the CSV primary value")
    linked = resolve_links(tables, identities)
    output.mkdir(parents=True, exist_ok=True, mode=0o700)
    queries, expected, field_rows, identity_rows, cell_rows = [], [], [], [], []
    types = {"Checkbox", "Number", "Multiple select", "Attachment", "User", "Date", "Link to another record"}
    link_target = {}
    for a, af, b, bf in LINK_PAIRS:
        link_target[(a, af)], link_target[(b, bf)] = b, a

    def digest(value):
        return hashlib.md5(json.dumps(value, ensure_ascii=False, separators=(", ", ": ")).encode()).hexdigest()

    for table in manifest["tables"]:
        key, export_id = table["table"], table["export_id"]
        definitions = metadata["fields"][key]
        for index, field in enumerate(definitions):
            options = dict(metadata["dateOptions"].get(key, {}).get(field["name"], {}))
            if (key, field["name"]) in link_target:
                options["linked_table"] = link_target[(key, field["name"])]
            field_rows.append([export_id, field["id"], field["name"], index, field["displayType"], options])
        fingerprints = []
        for number, row in enumerate(tables[key], 1):
            record_id = identities[key][str(number)]["id"]
            identity_rows.append([export_id, number, record_id])
            full_values = {}
            for field in definitions:
                name, field_id, kind = field["name"], field["id"], field["displayType"]
                options = metadata["dateOptions"].get(key, {}).get(name, {})
                value = linked[(key, number, name)] if kind == "Link to another record" else convert_cell(row[name], kind, options)
                full_values[field_id] = value
                if kind in types:
                    cell_rows.append([export_id, number, field_id, value])
            material = "\n".join(field_id + "=" + json.dumps(value, ensure_ascii=False, separators=(", ", ": "))
                                 for field_id, value in sorted(full_values.items()))
            fingerprints.append(hashlib.md5(material.encode()).hexdigest())
        expected.append({"table": key, "rows": len(tables[key]),
                         "data_md5": hashlib.md5("".join(fingerprints).encode()).hexdigest()})
    specs = [
        ("field_definitions", [("export_id", "(r->>0)::uuid"), ("field_id", "r->>1"),
                               ("field_name", "r->>2"), ("field_index", "(r->>3)::integer"),
                               ("display_type", "r->>4"), ("options", "r->5")], field_rows, 200),
        ("original_record_ids", [("export_id", "(r->>0)::uuid"), ("row_number", "(r->>1)::integer"),
                                 ("record_id", "r->>2")], identity_rows, 400),
        ("cell_values", [("export_id", "(r->>0)::uuid"), ("row_number", "(r->>1)::integer"),
                          ("field_id", "r->>2"), ("value", "r->3")], cell_rows, 800),
    ]
    for table, columns, values, chunk in specs:
        for start in range(0, len(values), chunk):
            path = output / ("reconcile-%03d.sql" % len(queries))
            path.write_text(bounded_insert(table, columns, values[start:start + chunk]), encoding="utf-8")
            path.chmod(0o600)
            queries.append(str(path.resolve()))
    summary = {"queries": queries, "expected": expected, "original_ids": len(identity_rows),
               "field_definitions": len(field_rows), "converted_cells": len(cell_rows),
               "directed_links": sum(len(value) for value in linked.values()),
               "comments": "Retained in Airtable archive by Tim's instruction, 2026-11-23",
               "creation_times": "Not provided by CSV; not inferred",
               "timestamp_precision": "Source-verified UTC, minute precision"}
    (output / "manifest.json").write_text(json.dumps(summary, indent=2) + "\n")
    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    result = prepare(args.source, args.checkpoint, args.out)
    print(json.dumps({key: result[key] for key in ["original_ids", "field_definitions", "converted_cells", "directed_links"]}))
