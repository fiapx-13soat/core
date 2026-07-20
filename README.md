# fiapx-core (NestJS)

Servico Core do FIAP X em TypeScript/NestJS, responsavel pelo fluxo sincrono: usuarios, autenticacao, upload, consulta e orquestracao de jobs com RabbitMQ.

## Arquitetura aplicada

Estrutura organizada em camadas (Clean Architecture pragmatica):

- `src/domain`: regras de dominio puras (status e transicoes de job)
- `src/application`: casos de uso (auth, users, jobs, consumer)
- `src/infra`: adapters de banco, cache, S3 e RabbitMQ
- `src/interfaces`: controllers HTTP
- `src/common` e `src/auth`: middleware, guards e estrategia JWT

## O que esta implementado

- CRUD da propria conta de usuario (`POST /users`, `GET|PATCH|DELETE /users/{id}`)
- Senhas com Argon2id
- Login e refresh com rotacao de refresh token (hash SHA-256 no banco)
- Upload de video com validacao (extensao + magic bytes), limite de tamanho e checksum
- Persistencia em PostgreSQL
- Upload para S3
- Publicacao com RabbitMQ em canal confirm (`ProcessingRequested`, `ProcessingCancelled`)
- Consumo de `q.core.results` com transicao idempotente de status
- `GET /jobs` com filtros (`status`, `from`, `to`) e cursor (`nextCursor`)
- `GET /jobs/{id}`, cancelamento, reprocessamento e download-link pre-assinado (max 15 min)
- Endpoint interno: `GET /internal/jobs/{jobId}/notification-info`
- Auditoria basica (`login`, `upload_video`, `cancel_job`, `delete_account`)
- `GET /health`, `GET /ready`, `GET /metrics`
- Rate limit de upload com `429` + `Retry-After`

## Variaveis de ambiente

- `PORT` (default `8080`)
- `DATABASE_URL`
- `AMQP_URL`
- `REDIS_URL` (opcional)
- `AWS_REGION`
- `AWS_ENDPOINT_URL` (opcional; localstack/floci)
- `S3_BUCKET_VIDEOS`
- `S3_BUCKET_ARCHIVES`
- `S3_PUBLIC_ENDPOINT` (opcional)
- `JWT_SECRET`
- `ACCESS_TOKEN_TTL_MINUTES` (default `15`)
- `REFRESH_TOKEN_TTL_DAYS` (default `7`)
- `UPLOAD_MAX_BYTES` (default `524288000`)
- `UPLOAD_RATE_LIMIT_PER_MIN` (default `20`)
- `UPLOAD_RATE_LIMIT_BURST` (default `5`)

## Banco de dados

A migracao inicial esta em `migrations/001_init.sql`.

## Rodar local

```bash
npm install
npm run build
npm test
npm run start:dev
```

## Docker

```bash
docker build -t fiapx-core .
docker run --rm -p 8080:8080 --env-file .env fiapx-core
```

## CI/CD

Workflow em `.github/workflows/ci.yml`:

1. Build + testes Node.
2. Push de imagem para ECR (`fiapx-core`) no `main` usando OIDC (`FIAPX_GITHUB_ACTIONS_ROLE_ARN`).

## Documentacao complementar

- `docs/IMPLEMENTATION.md` — resumo simples da implementacao feita.
- `docs/VALIDATION_CHECKLIST.md` — checklist para validar CA-C01..CA-C14 e DoD.
- `docs/REVIEW_NOTES.md` — decisoes e pontos de atencao para revisao.

