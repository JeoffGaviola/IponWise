"""Request validation models for IponWise endpoints."""
import re
from datetime import date as DateType
from decimal import Decimal
from typing import Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class ApiModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)


class TransactionCreate(ApiModel):
    type: Literal["deposit", "withdrawal"]
    category: str = Field(min_length=1, max_length=80)
    note: str = Field(default="", max_length=500)
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    date: DateType
    goal_id: UUID | None = Field(default=None, alias="goalId")

    @field_validator("category")
    @classmethod
    def category_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Category cannot be blank.")
        return value.strip()


GoalPriority = Literal["essential", "high", "normal", "optional"]
ContributionFrequency = Literal["daily", "weekly", "monthly"]


class GoalCreate(ApiModel):
    name: str = Field(min_length=2, max_length=100)
    category: str = Field(default="Personal", min_length=1, max_length=80)
    target: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    saved: Decimal = Field(default=Decimal("0"), ge=0, max_digits=14, decimal_places=2)
    deadline: DateType | None = None
    color: Literal["mint", "blue", "peach", "lavender"] = "mint"
    priority: GoalPriority = "normal"
    description: str = Field(default="", max_length=500)
    contribution_frequency: ContributionFrequency = Field(default="monthly", alias="contributionFrequency")

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, value: str) -> str:
        if len(value.strip()) < 2:
            raise ValueError("Goal name must have at least two characters.")
        return value.strip()

    @field_validator("saved")
    @classmethod
    def starting_savings_not_above_target(cls, value: Decimal, info):
        target = info.data.get("target")
        if target is not None and value > target:
            raise ValueError("Starting savings cannot exceed the target amount.")
        return value


class GoalUpdate(ApiModel):
    name: str | None = Field(default=None, min_length=2, max_length=100)
    category: str | None = Field(default=None, min_length=1, max_length=80)
    target: Decimal | None = Field(default=None, gt=0, max_digits=14, decimal_places=2)
    deadline: DateType | None = None
    color: Literal["mint", "blue", "peach", "lavender"] | None = None
    priority: GoalPriority | None = None
    description: str | None = Field(default=None, max_length=500)
    contribution_frequency: ContributionFrequency | None = Field(default=None, alias="contributionFrequency")


class ReminderCreate(ApiModel):
    title: str = Field(min_length=2, max_length=120)
    detail: str = Field(default="", max_length=500)
    time: str = Field(min_length=1, max_length=120)
    kind: Literal["deposit", "review", "goal"] = "deposit"
    active: bool = True
    due_date: DateType | None = None
    completed: bool = False


class ReminderUpdate(ApiModel):
    title: str | None = Field(default=None, min_length=2, max_length=120)
    detail: str | None = Field(default=None, max_length=500)
    time: str | None = Field(default=None, min_length=1, max_length=120)
    kind: Literal["deposit", "review", "goal"] | None = None
    active: bool | None = None
    due_date: DateType | None = None
    completed: bool | None = None


class ProfileUpdate(ApiModel):
    display_name: str | None = Field(default=None, max_length=120)
    currency_code: Literal["PHP", "USD", "SGD", "AUD", "EUR", "GBP"] | None = None
    theme: Literal["light", "dark", "system"] | None = None
    email_summaries_enabled: bool | None = None
    savings_reminders_enabled: bool | None = None
    onboarding_dismissed: bool | None = None


class TransactionUpdate(ApiModel):
    type: Literal["deposit", "withdrawal"] | None = None
    category: str | None = Field(default=None, min_length=1, max_length=80)
    note: str | None = Field(default=None, max_length=500)
    amount: Decimal | None = Field(default=None, gt=0, max_digits=14, decimal_places=2)
    date: DateType | None = None
    goal_id: UUID | None = Field(default=None, alias="goalId")


WalletKind = Literal["ewallet", "bank", "atm", "cash", "investment"]
WalletSource = Literal["manual", "qr", "card"]
CardNetwork = Literal["visa", "mastercard", "amex", "jcb", "unionpay", "discover", "other"]
CurrencyCode = Literal["PHP", "USD", "SGD", "AUD", "EUR", "GBP"]

# Detect values shaped like full payment-card numbers before they can be persisted in free text.
_CARD_LIKE = re.compile(r"(?<!\d)(?:\d[ -]?){13,19}(?!\d)")


def luhn_valid(digits: str) -> bool:
    """Standard Luhn checksum used by payment-card numbers."""
    if not digits.isdigit():
        return False
    total, flip = 0, False
    for char in reversed(digits):
        value = int(char)
        if flip:
            value *= 2
            if value > 9:
                value -= 9
        total += value
        flip = not flip
    return total % 10 == 0


def contains_card_number(text: str) -> bool:
    """True when free text holds something that looks like a full card number (13-19 digits, Luhn-valid)."""
    for match in _CARD_LIKE.finditer(text or ""):
        digits = re.sub(r"\D", "", match.group())
        if 13 <= len(digits) <= 19 and luhn_valid(digits):
            return True
    return False


CARD_NUMBER_MESSAGE = (
    "Please don't enter a full card number here. IponWise only needs the last 4 digits "
    "and never stores card numbers, expiry dates, CVVs, PINs or one-time codes."
)


def _reject_card_numbers(value: str | None) -> str | None:
    if value and contains_card_number(value):
        raise ValueError(CARD_NUMBER_MESSAGE)
    return value


class WalletCreate(ApiModel):
    name: str = Field(min_length=2, max_length=80)
    provider: str = Field(min_length=2, max_length=80)
    kind: WalletKind = "ewallet"
    balance: Decimal = Field(ge=0, max_digits=14, decimal_places=2)
    currency_code: CurrencyCode = "PHP"
    note: str = Field(default="", max_length=250)
    # Persist only privacy-safe card identifiers.
    source: WalletSource = "manual"
    card_last4: str | None = Field(default=None, pattern=r"^[0-9]{4}$")
    card_network: CardNetwork | None = None
    account_tail: str | None = Field(default=None, pattern=r"^[0-9A-Za-z]{1,4}$")

    @field_validator("name", "provider")
    @classmethod
    def wallet_text_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("This field cannot be blank.")
        _reject_card_numbers(value)
        return value.strip()

    @field_validator("note")
    @classmethod
    def note_has_no_card_number(cls, value: str) -> str:
        return _reject_card_numbers(value) or ""

    @model_validator(mode="after")
    def card_accounts_need_last4(self):
        if self.source == "card" and not self.card_last4:
            raise ValueError("Enter the last 4 digits of the card so you can recognise it.")
        return self


class WalletUpdate(ApiModel):
    name: str | None = Field(default=None, min_length=2, max_length=80)
    provider: str | None = Field(default=None, min_length=2, max_length=80)
    kind: WalletKind | None = None
    balance: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    currency_code: CurrencyCode | None = None
    note: str | None = Field(default=None, max_length=250)
    card_last4: str | None = Field(default=None, pattern=r"^[0-9]{4}$")
    card_network: CardNetwork | None = None
    account_tail: str | None = Field(default=None, pattern=r"^[0-9A-Za-z]{1,4}$")

    @field_validator("name", "provider", "note")
    @classmethod
    def no_card_numbers(cls, value: str | None) -> str | None:
        return _reject_card_numbers(value)


class AssistantHistoryTurn(ApiModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2000)

    @field_validator("content")
    @classmethod
    def message_has_no_card_number(cls, value: str) -> str:
        return _reject_card_numbers(value) or ""


class AssistantRequest(ApiModel):
    message: str = Field(min_length=1, max_length=1000)
    history: list[AssistantHistoryTurn] = Field(default_factory=list, max_length=6)

    @field_validator("message")
    @classmethod
    def message_has_no_card_number(cls, value: str) -> str:
        return _reject_card_numbers(value) or ""


class AssistantReply(ApiModel):
    reply: str
