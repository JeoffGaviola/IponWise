"""Response serializers for API records."""
from typing import Any

def _date_str(value: Any) -> str | None:
    if value is None:
        return None

    return (
        value.isoformat()
        if hasattr(value, "isoformat")
        else str(value)
    )


def _id_str(value: Any) -> str | None:
    return str(value) if value is not None else None


def _transaction(row: Any) -> dict[str, Any]:
    return {
        "id": _id_str(row["id"]),
        "type": row["transaction_type"],
        "category": row["category"],
        "note": row["note"],
        "amount": float(row["amount"]),
        "date": _date_str(row["transaction_date"]),
        "goalId": _id_str(row["goal_id"]),
    }


def _goal(row: Any) -> dict[str, Any]:
    return {
        "id": _id_str(row["id"]),
        "name": row["name"],
        "category": row["category"],
        "target": float(row["target_amount"]),
        "saved": float(row["saved_amount"]),
        "deadline": _date_str(row["deadline"]),
        "color": row["color"],
        "icon": "target",
        "priority": row.get("priority") or "normal",
        "description": row.get("description") or "",
        "contributionFrequency": row.get("contribution_frequency") or "monthly",
        "createdAt": _date_str(row.get("created_at")),
    }


def _reminder(row: Any) -> dict[str, Any]:
    return {
        "id": _id_str(row["id"]),
        "title": row["title"],
        "detail": row["detail"],
        "time": row["schedule_label"],
        "active": bool(row["is_active"]),
        "kind": row["reminder_type"],
        "dueDate": _date_str(row.get("due_date")),
        "completed": bool(row.get("completed", False)),
    }


