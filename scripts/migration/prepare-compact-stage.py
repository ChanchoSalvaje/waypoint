"""Produce size-bounded data-only SQL using PostgreSQL's OpenPGP decoder.

The envelope is compressed before transfer; decoded JSON is passed to ordinary
INSERT, never executed as SQL. This reduces large API request bodies. The
ephemeral envelope passphrase travels with its payload; this is a transport
encoding, not a backup-encryption mechanism or a database credential.
"""
import argparse
import base64
import csv
import json
from pathlib import Path
import secrets
import zlib
import pgpy
from pgpy.constants import CompressionAlgorithm, SymmetricKeyAlgorithm


def quote(value):
    return "'" + value.replace("'", "''") + "'"


def json_text(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def insert_sql(export_id, rows):
    text = json_text(rows)
    password = secrets.token_hex(16)
    message = pgpy.PGPMessage.new(text, compression=CompressionAlgorithm.ZIP)
    encrypted = message.encrypt(password, cipher=SymmetricKeyAlgorithm.AES256)
    encoded = base64.b64encode(bytes(encrypted)).decode("ascii")
    return ("with payload as (select convert_from(extensions.pgp_sym_decrypt_bytea(decode(" +
            quote(encoded) + ",'base64')," + quote(password) + "),'UTF8')::jsonb as data),\n" +
            "inserted as (insert into waypoint_migration.csv_rows(export_id,row_number,cells) " +
            "select " + quote(export_id) + "::uuid,(r->>0)::integer,r->1 " +
            "from payload, jsonb_array_elements(data) as r " +
            "on conflict(export_id,row_number) do nothing returning row_number) " +
            "select count(*)::integer as inserted_rows from inserted;")


def prepare(source, manifest_path, output):
    manifest = json.loads(manifest_path.read_text())
    output.mkdir(parents=True, exist_ok=True, mode=0o700)
    receipts = []
    for table in manifest["tables"]:
        with (source / table["file"]).open(encoding="utf-8-sig", newline="") as f:
            reader = csv.reader(f, strict=True)
            next(reader)
            rows = list(reader)
        batch = []

        def save():
            sql = insert_sql(table["export_id"], batch)
            if len(sql.encode()) > 60_000:
                raise ValueError("Compressed transfer exceeds the hard request bound")
            path = output / ("compact-%03d.sql" % len(receipts))
            path.write_text(sql, encoding="utf-8")
            path.chmod(0o600)
            receipts.append({"table": table["table"], "first_row": batch[0][0],
                             "last_row": batch[-1][0], "rows": len(batch),
                             "sql_bytes": len(sql.encode()), "path": str(path.resolve())})

        for number, row in enumerate(rows, 1):
            candidate = batch + [[number, row]]
            text = json_text(candidate).encode()
            if batch and (len(batch) >= 100 or len(text) > 250_000 or len(zlib.compress(text)) > 28_000):
                save()
                batch = []
            batch.append([number, row])
        if batch:
            save()
    result = {"phase": "csv_staging_only", "batches": receipts}
    path = output / "manifest.json"
    path.write_text(json.dumps(result, indent=2) + "\n")
    path.chmod(0o600)
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    result = prepare(args.source, args.manifest, args.out)
    print(json.dumps({"batches": len(result["batches"]),
                      "total_sql_bytes": sum(x["sql_bytes"] for x in result["batches"]),
                      "largest_sql_bytes": max(x["sql_bytes"] for x in result["batches"])}))
