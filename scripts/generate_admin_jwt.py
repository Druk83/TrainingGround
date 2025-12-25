#!/usr/bin/env python3
"""
Генератор JWT токена для тестирования админки.
ВНИМАНИЕ: Это только для локальной разработки!
"""

import jwt
import datetime
import os

# Получаем JWT_SECRET из .env или используем дефолтный для dev
JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-change-in-production")

# Создаем claims для администратора
claims = {
    "sub": "admin@localhost",  # user_id из superuser seed
    "role": "admin",
    "group_ids": ["admin"],
    "exp": int((datetime.datetime.utcnow() + datetime.timedelta(hours=24)).timestamp()),
    "iat": int(datetime.datetime.utcnow().timestamp()),
}

# Генерируем токен
token = jwt.encode(claims, JWT_SECRET, algorithm="HS256")

print("JWT токен для админа (действителен 24 часа):")
print("")
print(token)
print("")
print("Использование в API запросах:")
print(f'Authorization: Bearer {token}')
print("")
print("Для тестирования в браузере:")
print("1. Откройте DevTools (F12)")
print("2. Перейдите в Console")
print("3. Выполните:")
print(f"   localStorage.setItem('auth_token', '{token}')")
print("")
print("Или используйте curl:")
print(f"curl -H 'Authorization: Bearer {token}' http://localhost:8081/admin/templates")
