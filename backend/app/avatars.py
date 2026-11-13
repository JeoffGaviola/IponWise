"""Authenticated profile avatar operations using private Supabase Storage."""

from __future__ import annotations

import io
import logging
import os
import warnings
from datetime import datetime
from typing import Any
from urllib.parse import quote
from uuid import UUID, uuid4

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from .auth import get_current_user
from .account_helpers import _ensure_profile
from .config import load_environment
from .db import get_db

load_environment()

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/profile/avatar",
    tags=["Profile avatar"],
)

BUCKET = "profile-avatars"
MAX_UPLOAD_BYTES = 5 * 1024 * 1024
MAX_IMAGE_PIXELS = 25_000_000
SIGNED_URL_SECONDS = 3600
ACCEPTED_FORMATS = {"JPEG", "PNG", "WEBP"}


class AvatarService:
    """Encapsulate image processing and private storage operations."""

    def __init__(self) -> None:
        self.base_url = os.getenv("SUPABASE_URL", "").rstrip("/")
        self.service_role_key = os.getenv(
            "SUPABASE_SERVICE_ROLE_KEY", ""
        )

    def headers(self) -> dict[str, str]:
        if not self.base_url or not self.service_role_key:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=(
                    "Profile picture storage is not configured "
                    "on the server."
                ),
            )

        return {
            "apikey": self.service_role_key,
            "Authorization": f"Bearer {self.service_role_key}",
        }

    @staticmethod
    def normalize_image(raw: bytes) -> bytes:
        """Validate an image and normalize it to WebP."""

        try:
            with warnings.catch_warnings():
                warnings.simplefilter(
                    "error",
                    Image.DecompressionBombWarning,
                )

                with Image.open(io.BytesIO(raw)) as check_image:
                    if check_image.format not in ACCEPTED_FORMATS:
                        raise HTTPException(
                            status_code=(
                                status.HTTP_415_UNSUPPORTED_MEDIA_TYPE
                            ),
                            detail=(
                                "Only JPEG, PNG, and WebP images "
                                "are supported."
                            ),
                        )

                    if (
                        check_image.width < 1
                        or check_image.height < 1
                    ):
                        raise HTTPException(
                            status_code=400,
                            detail="The image dimensions are invalid.",
                        )

                    if (
                        check_image.width * check_image.height
                        > MAX_IMAGE_PIXELS
                    ):
                        raise HTTPException(
                            status_code=400,
                            detail="The image dimensions are too large.",
                        )

                    check_image.verify()

                with Image.open(io.BytesIO(raw)) as source:
                    image = ImageOps.exif_transpose(source)

                    if image.width * image.height > MAX_IMAGE_PIXELS:
                        raise HTTPException(
                            status_code=400,
                            detail="The image dimensions are too large.",
                        )

                    image.thumbnail(
                        (512, 512),
                        Image.Resampling.LANCZOS,
                    )

                    has_alpha = (
                        "A" in image.getbands()
                        or "transparency" in image.info
                    )

                    image = image.convert(
                        "RGBA" if has_alpha else "RGB"
                    )

                    output = io.BytesIO()
                    image.save(
                        output,
                        format="WEBP",
                        quality=86,
                        method=6,
                    )

                    return output.getvalue()

        except HTTPException:
            raise

        except (
            UnidentifiedImageError,
            OSError,
            ValueError,
            Image.DecompressionBombError,
            Image.DecompressionBombWarning,
        ) as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Upload a valid JPEG, PNG, or WebP image."
                ),
            ) from exc

    async def _request(
        self,
        method: str,
        url: str,
        **kwargs: Any,
    ) -> httpx.Response:
        headers = {
            **self.headers(),
            **kwargs.pop("headers", {}),
        }

        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                response = await client.request(
                    method,
                    url,
                    headers=headers,
                    **kwargs,
                )

            return response

        except httpx.HTTPError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=(
                    "Profile picture storage is temporarily "
                    "unavailable."
                ),
            ) from exc

    def object_url(self, path: str | None = None) -> str:
        if not self.base_url:
            self.headers()

        base = (
            f"{self.base_url}/storage/v1/object/{BUCKET}"
        )

        if path:
            return f"{base}/{quote(path, safe='/')}"

        return base

    async def upload(
        self,
        path: str,
        image_bytes: bytes,
    ) -> None:
        response = await self._request(
            "POST",
            self.object_url(path),
            headers={
                "Content-Type": "image/webp",
                "x-upsert": "false",
            },
            content=image_bytes,
        )

        if response.status_code >= 300:
            logger.error(
                "Supabase Storage avatar upload failed: HTTP %s",
                response.status_code,
            )
            raise HTTPException(
                status_code=502,
                detail="The profile picture could not be uploaded.",
            )

    async def get_signed_url(self, path: str) -> str:
        url = (
            f"{self.base_url}/storage/v1/object/sign/"
            f"{BUCKET}/{quote(path, safe='/')}"
        )

        response = await self._request(
            "POST",
            url,
            json={"expiresIn": SIGNED_URL_SECONDS},
        )

        if response.status_code >= 300:
            logger.error(
                "Supabase Storage signed URL failed: HTTP %s",
                response.status_code,
            )
            raise HTTPException(
                status_code=502,
                detail="The profile picture could not be retrieved.",
            )

        try:
            result = response.json()
            signed_path = (
                result.get("signedURL")
                or result.get("signedUrl")
            )
        except (ValueError, AttributeError) as exc:
            raise HTTPException(
                status_code=502,
                detail="Storage returned an invalid image URL.",
            ) from exc

        if not isinstance(signed_path, str) or not signed_path:
            raise HTTPException(
                status_code=502,
                detail="Storage returned an invalid image URL.",
            )

        if signed_path.startswith(("https://", "http://")):
            return signed_path

        if signed_path.startswith("/storage/v1/"):
            return f"{self.base_url}{signed_path}"

        if signed_path.startswith("/"):
            return f"{self.base_url}/storage/v1{signed_path}"

        return (
            f"{self.base_url}/storage/v1/"
            f"{signed_path.lstrip('/')}"
        )

    async def delete(self, path: str) -> None:
        response = await self._request(
            "DELETE",
            self.object_url(),
            json={"prefixes": [path]},
        )

        if response.status_code >= 300:
            logger.error(
                "Supabase Storage avatar deletion failed: HTTP %s",
                response.status_code,
            )
            raise HTTPException(
                status_code=502,
                detail=(
                    "The stored profile picture could not be deleted."
                ),
            )


avatar_service = AvatarService()


def get_profile_avatar(
    db: Session,
    user_id: str,
) -> Any:
    """Retrieve avatar metadata for the authenticated user only."""

    return db.execute(
        text(
            """
            SELECT avatar_storage_path, avatar_updated_at
            FROM public.user_profiles
            WHERE id = :user_id
            """
        ),
        {"user_id": UUID(user_id)},
    ).mappings().first()


def _save_avatar_metadata(db: Session, user_id: str, path: str) -> Any:
    result = db.execute(
        text(
            """
            UPDATE public.user_profiles
            SET avatar_storage_path = :path,
                avatar_updated_at = now(),
                updated_at = now()
            WHERE id = :user_id
            RETURNING avatar_updated_at
            """
        ),
        {"path": path, "user_id": UUID(user_id)},
    ).mappings().first()
    if result is None:
        raise SQLAlchemyError("The user profile was not updated.")
    db.commit()
    return result


def _remove_avatar_metadata(db: Session, user_id: str) -> None:
    db.execute(
        text(
            """
            UPDATE public.user_profiles
            SET avatar_storage_path = NULL,
                avatar_updated_at = NULL,
                updated_at = now()
            WHERE id = :user_id
            """
        ),
        {"user_id": UUID(user_id)},
    )
    db.commit()


@router.get("")
async def read_avatar(
    user: dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Read the authenticated user's profile picture."""

    await run_in_threadpool(_ensure_profile, db, user)
    row = await run_in_threadpool(get_profile_avatar, db, user["id"])
    path = row["avatar_storage_path"] if row else None
    updated_at = row["avatar_updated_at"] if row else None

    return {
        "avatar_url": (
            await avatar_service.get_signed_url(path)
            if path
            else None
        ),
        "avatar_updated_at": (
            updated_at.isoformat()
            if isinstance(updated_at, datetime)
            else None
        ),
    }


@router.put("")
async def upsert_avatar(
    file: UploadFile = File(...),
    user: dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Upload or replace the authenticated user's profile picture."""

    raw = await file.read(MAX_UPLOAD_BYTES + 1)
    await file.close()

    if not raw:
        raise HTTPException(
            status_code=400,
            detail="Choose an image to upload.",
        )

    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail="The maximum profile picture size is 5 MB.",
        )

    normalized = await run_in_threadpool(avatar_service.normalize_image, raw)

    await run_in_threadpool(_ensure_profile, db, user)

    existing = await run_in_threadpool(get_profile_avatar, db, user["id"])
    old_path = (
        existing["avatar_storage_path"]
        if existing
        else None
    )

    # Do not replace the current avatar until the new upload and metadata update succeed.
    new_path = f"{user['id']}/{uuid4().hex}.webp"

    await avatar_service.upload(new_path, normalized)

    try:
        # Avoid storing metadata for an object that cannot be served.
        new_signed_url = await avatar_service.get_signed_url(
            new_path
        )

        result = await run_in_threadpool(_save_avatar_metadata, db, user["id"], new_path)

    except (SQLAlchemyError, HTTPException) as exc:
        db.rollback()

        try:
            await avatar_service.delete(new_path)
        except HTTPException:
            logger.exception(
                "Uploaded avatar cleanup failed after an unsuccessful save."
            )

        if isinstance(exc, HTTPException):
            raise

        raise HTTPException(
            status_code=500,
            detail="The profile picture could not be saved.",
        ) from exc

    cleanup_pending = False

    if old_path and old_path != new_path:
        try:
            await avatar_service.delete(old_path)
        except HTTPException:
            cleanup_pending = True
            logger.exception(
                "The previous avatar could not be cleaned up."
            )

    return {
        "avatar_url": new_signed_url,
        "avatar_storage_path": new_path,
        "avatar_updated_at": (
            result["avatar_updated_at"].isoformat()
            if result and result["avatar_updated_at"]
            else None
        ),
        "storage_cleanup_pending": cleanup_pending,
    }


@router.delete("")
async def remove_avatar(
    user: dict[str, Any] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Remove the user's avatar and restore the initials fallback."""

    await run_in_threadpool(_ensure_profile, db, user)

    existing = await run_in_threadpool(get_profile_avatar, db, user["id"])
    old_path = (
        existing["avatar_storage_path"]
        if existing
        else None
    )

    try:
        await run_in_threadpool(_remove_avatar_metadata, db, user["id"])

    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="The profile picture could not be removed.",
        ) from exc

    cleanup_pending = False

    if old_path:
        try:
            await avatar_service.delete(old_path)
        except HTTPException:
            cleanup_pending = True
            logger.exception(
                "Avatar metadata was cleared, but storage cleanup failed."
            )

    return {
        "deleted": True,
        "storage_cleanup_pending": cleanup_pending,
    }
