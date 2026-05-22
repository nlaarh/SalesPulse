"""User repository — all user CRUD operations."""

from typing import Optional
from sqlalchemy.orm import Session
from data.models import User


def get_user_by_id(db: Session, user_id: int) -> Optional[User]:
    return db.query(User).filter(User.id == user_id).first()


def get_user_by_email(db: Session, email: str) -> Optional[User]:
    return db.query(User).filter(User.email == email).first()


def list_users(db: Session, active_only: bool = False) -> list[User]:
    q = db.query(User)
    if active_only:
        q = q.filter(User.is_active == True)  # noqa: E712
    return q.order_by(User.id).all()


def create_user(db: Session, *, email: str, name: str, password_hash: str, role: str = 'officer') -> User:
    user = User(email=email, name=name, password_hash=password_hash, role=role, is_active=True)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def update_user(db: Session, user: User, **fields) -> User:
    for key, value in fields.items():
        if value is not None and hasattr(user, key):
            setattr(user, key, value)
    db.commit()
    db.refresh(user)
    return user


def delete_user(db: Session, user: User) -> None:
    db.delete(user)
    db.commit()


def count_users(db: Session) -> int:
    return db.query(User).count()
