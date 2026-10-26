"""Read-only template for validating records in a JSON export.

Usage:
  python verify_data_template.py export.json --required id --required name --unique id
  python verify_data_template.py export.json --type active=bool --type count=int

This validates a local JSON file only; it does not connect to or modify a database.
"""

import argparse
import json
import sys
from pathlib import Path

TYPE_CHECKS = {
    "str": lambda value: isinstance(value, str),
    "int": lambda value: isinstance(value, int) and not isinstance(value, bool),
    "float": lambda value: isinstance(value, (int, float)) and not isinstance(value, bool),
    "bool": lambda value: isinstance(value, bool),
    "list": lambda value: isinstance(value, list),
    "dict": lambda value: isinstance(value, dict),
}


def parse_type_check(value):
    if "=" not in value:
        raise argparse.ArgumentTypeError("expected FIELD=TYPE")
    field, type_name = value.split("=", 1)
    if not field or type_name not in TYPE_CHECKS:
        allowed = ", ".join(TYPE_CHECKS)
        raise argparse.ArgumentTypeError(f"type must be one of: {allowed}")
    return field, type_name


def validate_records(records, required_fields=(), unique_fields=(), type_checks=()):
    errors = []
    seen = {field: set() for field in unique_fields}

    if not isinstance(records, list):
        return ["top-level JSON value must be an array of records"]

    for index, record in enumerate(records, start=1):
        if not isinstance(record, dict):
            errors.append(f"record {index}: expected an object")
            continue

        for field in required_fields:
            if field not in record:
                errors.append(f"record {index}: missing required field {field!r}")

        for field, type_name in type_checks:
            if field in record and not TYPE_CHECKS[type_name](record[field]):
                errors.append(
                    f"record {index}: field {field!r} must be {type_name}"
                )

        for field in unique_fields:
            if field not in record:
                continue
            value = record[field]
            try:
                duplicate = value in seen[field]
                seen[field].add(value)
            except TypeError:
                errors.append(f"record {index}: unique field {field!r} must be hashable")
                continue
            if duplicate:
                errors.append(f"record {index}: duplicate value for {field!r}: {value!r}")

    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("json_file", type=Path, help="path to a JSON export")
    parser.add_argument(
        "--required",
        action="append",
        default=[],
        metavar="FIELD",
        help="field required on every record (repeatable)",
    )
    parser.add_argument(
        "--unique",
        action="append",
        default=[],
        metavar="FIELD",
        help="field whose values must be unique across records (repeatable)",
    )
    parser.add_argument(
        "--type",
        dest="type_checks",
        action="append",
        type=parse_type_check,
        default=[],
        metavar="FIELD=TYPE",
        help=f"field type check (repeatable; types: {', '.join(TYPE_CHECKS)})",
    )
    args = parser.parse_args()

    try:
        with args.json_file.open(encoding="utf-8") as source:
            records = json.load(source)
    except (OSError, json.JSONDecodeError) as error:
        print(f"Could not read JSON input: {error}", file=sys.stderr)
        return 2

    errors = validate_records(
        records,
        required_fields=args.required,
        unique_fields=args.unique,
        type_checks=args.type_checks,
    )
    if errors:
        print(f"Validation failed with {len(errors)} issue(s):")
        for error in errors:
            print(f"- {error}")
        return 1

    count = len(records)
    print(f"Validation passed: {count} record(s) checked.")
    if not (args.required or args.unique or args.type_checks):
        print("No field constraints were supplied; only the JSON array/object shape was checked.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
