# Thesauros Partner API v1 — QA Testing Guide

**Partner API** — бэкенд-сервис для работы с партнёрской программой. Партнёры (кошельки, финтех-приложения, агрегаторы) интегрируют Thesauros через API и получают revenue share с доходности привлечённых пользователей.

### Что делает этот сервис

1. **Partner Attribution** — отслеживание, какой партнёр привёл какого пользователя, через какую кампанию и с какого источника (UTM-метки, реферальные ссылки, виджеты).

2. **Partner Dashboard API** — self-service API для партнёров: сводка по привлечённым пользователям, депозитам, TVL, начисленному yield, поинтам и revenue share. Партнёр видит только своих пользователей.

3. **Admin API** — внутренний API для управления партнёрами, кампаниями и API-ключами. Используется командой Thesauros.

4. **Аутентификация и авторизация** — Bearer API-ключи с системой скоупов. Каждый ключ привязан к набору прав и (опционально) к конкретному партнёру. Rate limiting 60 запросов/минуту.

### Модули

| Модуль | Назначение |
|---|---|
| **AuthModule** | Генерация, валидация и отзыв API-ключей. Хэширование секретов (SHA-256), шифрование (AES-256-GCM). |
| **PartnerModule** | CRUD партнёров и кампаний. Attribution-логика (привязка user → partner → campaign). Расчёт revenue share. |
| **StoreModule** | Абстракция над базой данных. Seed тестовых данных при первом запуске. |
| **CryptoModule** | Шифрование/дешифрование секретов API-ключей (AES-256-GCM). |
| **DatabaseModule** | Подключение к PostgreSQL через TypeORM. |

### Описание эндпоинтов

| Группа | Префикс | Для кого | Что делает |
|---|---|---|---|
| **Keys** | `/api/v1/keys` | Админы Thesauros | Создание, просмотр и отзыв API-ключей |
| **Partners (Admin)** | `/api/v1/partners` | Админы Thesauros | Создание и управление партнёрами, создание кампаний |
| **Partner (Self-Service)** | `/api/v1/partner` | Партнёры | Просмотр своей статистики: пользователи, депозиты, TVL, yield, revenue share, позиции пользователей |

---

## Стенд

**Base URL:** `https://partner-api-production-10ad.up.railway.app`
**Swagger UI:** `https://partner-api-production-10ad.up.railway.app/swagger`
**Swagger JSON:** `https://partner-api-production-10ad.up.railway.app/swagger-json`

### Формат ответов

Все успешные ответы обёрнуты в JSON-конверт — на верхнем уровне ровно два поля, `object` и `data`:
```json
{
  "object": "partner",
  "data": {
    "id": "ptn_seed_acme",
    "object": "partner",
    "name": "Acme Wallet"
  }
}
```

- `object` конверта повторяет тип ресурса внутри `data` (`partner`, `campaign`, `api_key`, `partner_summary`, `partner_tvl`, `revenue_share`, `yield_history`, …).
- Для коллекций `object` = `"list"`, а `data` — массив:

```json
{ "object": "list", "data": [ { "id": "ptn_seed_acme", "object": "partner" } ] }
```

Ошибки возвращаются в формате:
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Partner not found."
  }
}
```

---

## 1. Аутентификация

Все запросы требуют заголовок `Authorization: Bearer <API_KEY>`.

### Предустановленные тестовые ключи

| Ключ | Скоупы | Партнёр | Описание |
|---|---|---|---|
| `tsk_test_master_full_access_000000000000000` | `read`, `write`, `keys:admin`, `partner:admin`, `partner:read` | — | **Master-ключ с полным доступом (для QA)** |
| `tsk_test_thesauros_sandbox_0000000000000000` | `read`, `write` | — | Bootstrap-ключ (без админ-прав) |
| `tsk_test_acme_partner_key_00000000000000000` | `partner:read` | Acme Wallet (`ptn_seed_acme`) | Партнёрский ключ Acme |
| `tsk_test_orbit_partner_key_0000000000000000` | `partner:read` | Orbit Finance (`ptn_seed_orbit`) | Партнёрский ключ Orbit |

### Скоупы

| Скоуп | Доступ |
|---|---|
| `read` | Чтение общих данных |
| `write` | Запись общих данных |
| `partner:read` | Чтение партнёрских данных (self-service) |
| `partner:admin` | Управление партнёрами (админ) |
| `keys:admin` | Управление API-ключами |

---

## 2. Тестовые данные (Seed Data)

### Партнёры

| ID | Имя | Revenue Share | Статус |
|---|---|---|---|
| `ptn_seed_acme` | Acme Wallet | 15% | active |
| `ptn_seed_orbit` | Orbit Finance | 20% | active |

### Кампании

| ID | Партнёр | Имя | UTM Source |
|---|---|---|---|
| `cmp_seed_acme_launch` | Acme | Acme Summer Launch | twitter |
| `cmp_seed_acme_earn` | Acme | Acme Earn Widget | widget |
| `cmp_seed_orbit_q3` | Orbit | Orbit Q3 Promo | newsletter |
| `cmp_seed_orbit_app` | Orbit | Orbit In-App | app |

### Пользователи

| ID | Имя | Привязан к партнёру |
|---|---|---|
| `usr_seed_nova` | Nova Treasury | Acme (через `cmp_seed_acme_launch`) |
| `usr_seed_orbit` | Orbit Payments | Acme (через `cmp_seed_acme_earn`) |
| `usr_seed_quill` | Quill Holdings | Orbit (через `cmp_seed_orbit_q3`) |

### Позиции

| ID | Пользователь | Актив | Principal | Статус | Партнёр |
|---|---|---|---|---|---|
| `pos_seed_alpha` | Nova | USDC | $25,000 | active | Acme |
| `pos_seed_beta` | Orbit | USDT | $10,000 | active | Acme |
| `pos_seed_gamma` | Nova | USDC | $50,000 | active | Acme |
| `pos_seed_delta` | Quill | USDC | $5,000 | closed | Orbit |

---

## 3. Эндпоинты и тест-кейсы

### 3.1 Keys Management (`/api/v1/keys`)

Требуемый скоуп: `keys:admin`

> Примечание: bootstrap-ключ имеет скоупы `read`, `write` — у него **нет** `keys:admin`. Для тестирования этих эндпоинтов нужно сначала создать ключ с `keys:admin` скоупом через Swagger или напрямую в БД.

#### `POST /api/v1/keys` — Создать API-ключ

```bash
curl -X POST https://partner-api-production-10ad.up.railway.app/api/v1/keys \
  -H "Authorization: Bearer <КЛЮЧ_С_keys:admin>" \
  -H "Content-Type: application/json" \
  -d '{"label": "Test Key", "scopes": ["read", "write"]}'
```

**Тест-кейсы:**
- [ ] Ответ — конверт `{ "object": "api_key", "data": { ... } }`
- [ ] Успешное создание ключа — `data.secret` содержит полный секрет (показывается один раз)
- [ ] `data` **НЕ** содержит `secret_hash` и `_plaintext_secret`
- [ ] `partner_id` несуществующего партнёра → **400**
- [ ] `partner_id` отключённого (`disabled`) партнёра → **400**
- [ ] Попытка создать ключ с `scopes: ["*"]` — **400 Bad Request** (wildcard запрещён)
- [ ] Попытка создать ключ с `scopes: ["keys:admin"]` — **400 Bad Request** (запрещён)
- [ ] `environment` всегда `test` — даже если передать `"environment": "live"` → **400**
- [ ] Без `Authorization` заголовка → **401 Unauthorized**
- [ ] С ключом без `keys:admin` скоупа → **403 Forbidden**

#### `GET /api/v1/keys` — Список ключей

```bash
curl https://partner-api-production-10ad.up.railway.app/api/v1/keys \
  -H "Authorization: Bearer <КЛЮЧ_С_keys:admin>"
```

**Тест-кейсы:**
- [ ] Возвращает массив ключей
- [ ] `secret` замаскирован (не содержит полный секрет)
- [ ] `secret_hash` **НЕ** присутствует в ответе

#### `DELETE /api/v1/keys/:id` — Отозвать ключ

```bash
curl -X DELETE https://partner-api-production-10ad.up.railway.app/api/v1/keys/KEY_ID \
  -H "Authorization: Bearer <КЛЮЧ_С_keys:admin>"
```

**Тест-кейсы:**
- [ ] Успешный отзыв → `{ "object": "api_key", "data": { "id": "...", "revoked": true } }`
- [ ] Повторный запрос с отозванным ключом → **401**
- [ ] Несуществующий ID → `data` = `{ "id": "...", "revoked": false }`

---

### 3.2 Partners Admin (`/api/v1/partners`)

Требуемый скоуп: `partner:admin`

#### `POST /api/v1/partners` — Создать партнёра

```bash
curl -X POST https://partner-api-production-10ad.up.railway.app/api/v1/partners \
  -H "Authorization: Bearer <КЛЮЧ_С_partner:admin>" \
  -H "Content-Type: application/json" \
  -d '{"name": "New Partner", "slug": "new-partner", "contact_email": "test@example.com", "revenue_share_pct": 0.10}'
```

**Тест-кейсы:**
- [ ] Создаёт партнёра и автоматически генерирует API-ключ для него
- [ ] `data` содержит `partner` и `api_key` с `secret`
- [ ] Без обязательных полей → **400**
- [ ] С ключом без `partner:admin` → **403**

#### `GET /api/v1/partners` — Список партнёров

```bash
curl https://partner-api-production-10ad.up.railway.app/api/v1/partners \
  -H "Authorization: Bearer <КЛЮЧ_С_partner:admin>"
```

**Тест-кейсы:**
- [ ] Возвращает всех партнёров
- [ ] Фильтр `?status=active` — только активные
- [ ] Фильтр `?status=disabled` — только отключённые

#### `GET /api/v1/partners/:id` — Партнёр по ID

```bash
curl https://partner-api-production-10ad.up.railway.app/api/v1/partners/ptn_seed_acme \
  -H "Authorization: Bearer <КЛЮЧ_С_partner:admin>"
```

**Тест-кейсы:**
- [ ] `ptn_seed_acme` → данные Acme Wallet
- [ ] Несуществующий ID → **404**

#### `PATCH /api/v1/partners/:id` — Обновить партнёра

```bash
curl -X PATCH https://partner-api-production-10ad.up.railway.app/api/v1/partners/ptn_seed_acme \
  -H "Authorization: Bearer tsk_test_master_full_access_000000000000000" \
  -H "Content-Type: application/json" \
  -d '{"status": "disabled"}'
```

**Зачем `status`:** hard-delete партнёра/кампании через API нет намеренно — attribution, позиции и revenue-история должны сохраняться. Soft-disable (`active` → `disabled`) выключает партнёра/кампанию без потери данных. Вернуть можно тем же PATCH с `"status": "active"`.

**Что происходит при `status: "disabled"`:**
1. Все активные API-ключи партнёра немедленно отзываются (`revoked: true`) — партнёр теряет доступ ко всем ручкам.
2. Ключ, привязанный к отключённому партнёру, отклоняется на этапе аутентификации даже если его не успели отозвать.
3. Выдать новый ключ отключённому партнёру нельзя (**400**).
4. Возврат в `active` **не** восстанавливает отозванные ключи — их нужно выпустить заново через `POST /api/v1/keys`.

**Тест-кейсы:**
- [ ] Ответ — конверт `{ "object": "partner", "data": { ... } }` с тем же набором полей, что и `GET /partners/:id` (включая `status`)
- [ ] Обновление `revenue_share_pct` → значение изменилось
- [ ] `{"status":"disabled"}` → партнёр disabled, виден в `GET /partners?status=disabled`
- [ ] После disable: `GET /api/v1/keys` → ключи партнёра с `revoked: true`
- [ ] После disable: запрос к `/api/v1/partner/*` ключом этого партнёра → **401** (ключ отозван)
- [ ] `{"status":"active"}` → снова active (ключи остаются отозванными — выпустить новый)
- [ ] `{"status":"deleted"}` → **400**
- [ ] `updated_at` обновился
- [ ] Несуществующий ID → **404**

#### `POST /api/v1/partners/:id/campaigns` — Создать кампанию

```bash
curl -X POST https://partner-api-production-10ad.up.railway.app/api/v1/partners/ptn_seed_acme/campaigns \
  -H "Authorization: Bearer tsk_test_master_full_access_000000000000000" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Campaign", "slug": "test-campaign", "utm_source": "test", "utm_medium": "manual"}'
```

#### `GET /api/v1/partners/:id/campaigns` — Кампании партнёра

```bash
curl https://partner-api-production-10ad.up.railway.app/api/v1/partners/ptn_seed_acme/campaigns \
  -H "Authorization: Bearer tsk_test_master_full_access_000000000000000"
```

**Тест-кейсы:**
- [ ] Acme → 2 кампании (`cmp_seed_acme_launch`, `cmp_seed_acme_earn`)
- [ ] Orbit → 2 кампании (`cmp_seed_orbit_q3`, `cmp_seed_orbit_app`)
- [ ] `?status=disabled` после soft-disable кампании

#### `PATCH /api/v1/partners/:id/campaigns/:campaignId` — Обновить / дизейблить кампанию

```bash
curl -X PATCH https://partner-api-production-10ad.up.railway.app/api/v1/partners/ptn_seed_acme/campaigns/cmp_seed_acme_launch \
  -H "Authorization: Bearer tsk_test_master_full_access_000000000000000" \
  -H "Content-Type: application/json" \
  -d '{"status": "disabled"}'
```

**Тест-кейсы:**
- [ ] `status: disabled` → кампания выключена
- [ ] Чужой `campaignId` для партнёра → **404**
- [ ] Можно менять `name` / `utm_source` / `utm_medium`

---

### 3.3 Partner Self-Service API (`/api/v1/partner`)

Требуемый скоуп: `partner:read`
Ключ должен быть привязан к партнёру (`partner_id`).

> Используй `tsk_test_acme_partner_key_00000000000000000` для Acme или `tsk_test_orbit_partner_key_0000000000000000` для Orbit.

#### `GET /api/v1/partner/summary` — Сводка по партнёру

```bash
curl https://partner-api-production-10ad.up.railway.app/api/v1/partner/summary \
  -H "Authorization: Bearer tsk_test_acme_partner_key_00000000000000000"
```

**Тест-кейсы:**
- [ ] Содержит: `partner`, `users`, `deposits`, `tvl`, `yield`, `points`, `revenue`
- [ ] `users.total` — количество привязанных пользователей (Acme: 2, Orbit: 1)
- [ ] `revenue.revenue_share_pct` — совпадает с настройкой партнёра (Acme: 0.15)
- [ ] С bootstrap-ключом (без `partner_id`) → **403** "requires a partner-scoped API key"

#### `GET /api/v1/partner/users` — Привязанные пользователи

```bash
curl https://partner-api-production-10ad.up.railway.app/api/v1/partner/users \
  -H "Authorization: Bearer tsk_test_acme_partner_key_00000000000000000"
```

**Тест-кейсы:**
- [ ] Acme → 2 пользователя (`usr_seed_nova`, `usr_seed_orbit`)
- [ ] Orbit → 1 пользователь (`usr_seed_quill`)
- [ ] Пользователи другого партнёра **не** видны

#### `GET /api/v1/partner/deposits` — Депозиты

```bash
curl https://partner-api-production-10ad.up.railway.app/api/v1/partner/deposits \
  -H "Authorization: Bearer tsk_test_acme_partner_key_00000000000000000"
```

**Тест-кейсы:**
- [ ] Acme: `total` = $85,000 (25k + 10k + 50k), `count` = 3
- [ ] Orbit: `total` = $5,000, `count` = 1

#### `GET /api/v1/partner/withdrawals` — Выводы

#### `GET /api/v1/partner/tvl` — Net TVL

**Тест-кейсы:**
- [ ] Acme TVL: сумма principal активных позиций = $85,000
- [ ] Orbit TVL: $0 (единственная позиция `closed`)

#### `GET /api/v1/partner/yield` — Начисленный yield

#### `GET /api/v1/partner/yield/history/:asset` — История yield по активу

```bash
curl https://partner-api-production-10ad.up.railway.app/api/v1/partner/yield/history/USDC \
  -H "Authorization: Bearer tsk_test_acme_partner_key_00000000000000000"
```

**Важно:** ручка возвращает **протокольный** blended APY по активу (по всем активным ваултам Thesauros), а не данные конкретного партнёра — серия одинакова для всех партнёров. Это явно помечено полем `data.scope: "protocol"`. Тем не менее ключ должен быть привязан к партнёру, как и на остальных self-service ручках.

**Тест-кейсы:**
- [ ] `USDC` → массив `history` из 30 точек, `blend_apy` > 0, `scope: "protocol"`
- [ ] `USDT` → аналогично
- [ ] `ETH` → **404** "Unsupported asset"
- [ ] Ключ со скоупом `partner:read`, но с `partner_id: null` → **403** "requires a partner-scoped API key"

#### `GET /api/v1/partner/points` — Начисленные поинты

#### `GET /api/v1/partner/revenue` — Revenue share

```bash
curl https://partner-api-production-10ad.up.railway.app/api/v1/partner/revenue \
  -H "Authorization: Bearer tsk_test_acme_partner_key_00000000000000000"
```

**Тест-кейсы:**
- [ ] `revenue_share_pct` = 0.15 для Acme
- [ ] Содержит `annual` и `daily` расчёты
- [ ] `partner_revenue` > 0

#### `GET /api/v1/partner/user/:id/positions` — Позиции пользователя

```bash
curl https://partner-api-production-10ad.up.railway.app/api/v1/partner/user/usr_seed_nova/positions \
  -H "Authorization: Bearer tsk_test_acme_partner_key_00000000000000000"
```

**Тест-кейсы:**
- [ ] `usr_seed_nova` через Acme-ключ → 2 позиции (`pos_seed_alpha`, `pos_seed_gamma`) + `current_value` и `accrued_yield`
- [ ] `usr_seed_quill` через Acme-ключ → **403** "not attributed to your partner"
- [ ] `usr_seed_quill` через Orbit-ключ → 1 позиция (`pos_seed_delta`)

---

## 4. Проверки безопасности

| # | Тест | Ожидаемый результат |
|---|---|---|
| S1 | Запрос без `Authorization` | 401 |
| S2 | Запрос с невалидным ключом | 401 |
| S3 | Запрос с отозванным ключом | 401 |
| S4 | `partner:read` ключ → `GET /api/v1/partners` (admin) | 403 |
| S5 | `read` ключ → `GET /api/v1/partner/summary` | 403 |
| S6 | Acme-ключ → `GET /api/v1/partner/user/usr_seed_quill/positions` | 403 (чужой пользователь) |
| S7 | Создание ключа с `scopes: ["*"]` | 400 |
| S8 | Создание ключа с `environment: "live"` | 400 |
| S9 | `GET /api/v1/keys` и `POST /api/v1/keys` → проверить что `secret_hash` и `_plaintext_secret` отсутствуют в ответе | Отсутствуют |
| S10 | Rate limiting: 61 запрос за минуту одним ключом (можно по разным ручкам) | 61-й → 429 Too Many Requests |
| S11 | Ключ отключённого (`disabled`) партнёра | 401 (отозван) / 403 (партнёр disabled) |
| S12 | Ключ с `partner:read`, но `partner_id: null` → любая `/api/v1/partner/*` ручка | 403 |

### Rate limiting

Лимит — **60 запросов в минуту на API-ключ, суммарно по всем ручкам** (без ключа — на IP). Раньше бюджет считался по каждому эндпоинту отдельно, поэтому 429 наступал только после ~200 запросов; теперь бюджет общий.

Каждый ответ содержит заголовки: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`; при 429 добавляется `Retry-After`.

```bash
for i in $(seq 1 61); do
  curl -s -o /dev/null -w "%{http_code}\n" \
    https://partner-api-production-10ad.up.railway.app/api/v1/partner/summary \
    -H "Authorization: Bearer tsk_test_acme_partner_key_00000000000000000"
done | sort | uniq -c
# ожидается: 60x 200, 1x 429
```

---

## 5. Проверки формата ответов

- [ ] Все успешные ответы обёрнуты в `{ "object": "...", "data": ... }` — на верхнем уровне ровно два поля
- [ ] `object` конверта совпадает с `data.object` для одиночных ресурсов, `"list"` — для массивов
- [ ] Все ошибки содержат `{ "error": { "code": "...", "message": "..." } }`
- [ ] HTTP-коды: 200 (ok), 201 (created), 400 (validation), 401 (no/bad auth), 403 (forbidden), 404 (not found), 429 (rate limit)

---

## 6. Инструменты для тестирования

1. **Swagger UI** — интерактивное тестирование прямо в браузере:
   `https://partner-api-production-10ad.up.railway.app/swagger`
   Нажать "Authorize" → вставить ключ → вызывать эндпоинты

2. **curl** — примеры выше

3. **Postman** — импортировать Swagger JSON:
   `https://partner-api-production-10ad.up.railway.app/swagger-json`
