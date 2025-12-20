# MongoDB Replica Set для Production

## Проблема
В dev окружении на Windows сложно настроить replica set из-за проблем с правами доступа к keyfile через Docker volumes.

## Dev решение
Используется standalone MongoDB без replica set. **Change Streams недоступны**, но для локальной разработки это приемлемо.

## Production решение

### Вариант 1: MongoDB Atlas (рекомендуется)
- Managed replica set из коробки
- Change Streams работают
- Автоматические бэкапы

### Вариант 2: Self-hosted replica set

#### Создание keyfile
```bash
# На Linux/Mac или в WSL
openssl rand -base64 756 > mongo-keyfile
chmod 400 mongo-keyfile
chown 999:999 mongo-keyfile  # UID mongodb в контейнере
```

#### docker-compose.yml для production
```yaml
mongodb:
  image: mongo:6
  command: ["--replSet", "rs0", "--bind_ip_all", "--keyFile", "/data/keyfile"]
  environment:
    MONGO_INITDB_ROOT_USERNAME: ${MONGO_USER}
    MONGO_INITDB_ROOT_PASSWORD: ${MONGO_PASSWORD}
  volumes:
    - mongodb_data:/data/db
    - ./mongo-keyfile:/data/keyfile:ro
  user: "999:999"
```

#### Инициализация replica set
```bash
docker-compose exec mongodb mongosh -u admin -p password --eval "rs.initiate()"
```

#### Проверка
```bash
docker-compose exec mongodb mongosh -u admin -p password --eval "rs.status()"
```

## Альтернатива для dev: Change Stream эмуляция
Если нужно тестировать Change Streams локально, используйте:
1. WSL2 с Docker Desktop
2. Или мокируйте события в `changestream_bridge.py`
