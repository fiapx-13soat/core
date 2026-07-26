# fiapx-core

**A API do FIAP X.** Serviço síncrono em NestJS/TypeScript: conta e autenticação, upload de vídeo,
consulta de jobs e download do resultado. É a porta de entrada do sistema — recebe o vídeo,
persiste, guarda no S3 e pede o processamento ao **workers** por mensageria; quando o resultado
volta, disponibiliza o ZIP.

> Faz parte do sistema **FIAP X**. A bancada que sobe tudo junto (RabbitMQ, S3, workers,
> notification) vive no repo **[fiapx-infra](https://github.com/fiapx-13soat/infra)** — comece por
> lá se quer o fluxo ponta a ponta.

## Começar

O jeito mais simples de ver funcionando é a bancada do infra (`make up-dev`). Para trabalhar só
neste serviço, com RabbitMQ e S3 no ar:

```bash
cp .env.example .env    # ajuste se precisar
npm ci
npm run start:dev       # sobe em http://localhost:8080
```

```bash
npm test                # unitários
npm run test:int        # integração (Postgres, Redis e RabbitMQ via Testcontainers; requer Docker)
npm run lint            # ESLint + Prettier
```

## Arquitetura

Camadas no estilo Clean Architecture pragmático — o domínio no centro, adapters na borda:

```
src/
├── domain/        regras puras (status do job e suas transições)
├── application/   casos de uso (auth, users, jobs) e o consumer de resultados
├── infra/         adapters: Postgres, Redis, S3, RabbitMQ
├── interfaces/    controllers HTTP
├── auth/          estratégia JWT e guards
└── common/        logger estruturado, correlationId, métricas
```

## API

Todas as rotas de negócio sob `/api/v1`; observabilidade na raiz.

| Área | Rotas |
|---|---|
| Conta | `POST /users` · `GET\|PATCH\|DELETE /users/{id}` |
| Auth | `POST /auth/login` · `POST /auth/refresh` |
| Vídeo | `POST /videos` (multipart, campo `video`) |
| Jobs | `GET /jobs` (filtros `status`/`from`/`to`, cursor) · `GET /jobs/{id}` · `.../cancel` · `.../reprocess` · `.../download-link` |
| Interno | `GET /internal/jobs/{jobId}/notification-info` (consumido pelo notification) |
| Saúde | `GET /health` · `GET /ready` · `GET /metrics` |

Destaques de implementação: senhas com **Argon2id**; refresh token com rotação (hash SHA-256 no
banco); upload validado por extensão **e magic bytes**, com limite de tamanho, checksum e rate
limit (`429` + `Retry-After`); publicação no RabbitMQ em **canal confirm**; consumo de
`q.core.results` com transição de status **idempotente**; download por **pre-signed URL** (máx. 15
min). Uma coleção **[Bruno](bruno/)** exercita a jornada inteira de forma clicável.

## Variáveis de ambiente

Obrigatórias (o boot falha sem elas): `DATABASE_URL`, `AMQP_URL`, `S3_BUCKET_VIDEOS`,
`S3_BUCKET_ARCHIVES`, `JWT_SECRET`.

| Opcional | Default | Para quê |
|---|---|---|
| `PORT` | `8080` | Porta HTTP |
| `REDIS_URL` | — | Cache (sem ele, sem cache) |
| `AWS_REGION` | `us-east-1` | Região do S3 |
| `AWS_ENDPOINT_URL` | — | S3 emulado (Floci) local; **vazio na AWS** |
| `S3_PUBLIC_ENDPOINT` | — | Reescreve o host da pre-signed URL para o navegador |
| `ACCESS_TOKEN_TTL_MINUTES` | `15` | Validade do access token |
| `REFRESH_TOKEN_TTL_DAYS` | `7` | Validade do refresh token |
| `UPLOAD_MAX_BYTES` | `524288000` | Limite de upload (500 MB) |
| `UPLOAD_RATE_LIMIT_PER_MIN` / `_BURST` | `20` / `5` | Rate limit de upload |

O schema está em [`migrations/`](migrations/) e é **aplicado no próprio boot** (self-migration,
idempotente) — o serviço é dono das suas tabelas. O infra só provisiona o banco vazio e a role.

## Docker

```bash
docker build -t fiapx-core .
docker run --rm -p 8080:8080 --env-file .env fiapx-core
```

## CI/CD

[`.github/workflows/ci.yml`](.github/workflows/ci.yml): a cada PR, **lint + build + testes**
(unitários e integração). No merge para `main`, builda e publica a imagem no **ECR** (`fiapx-core`,
tags `sha` e `latest`). Autenticação por credencial de sessão do AWS Academy Learner Lab (secrets
`AWS_ACCESS_KEY_ID`/`SECRET`/`SESSION_TOKEN`) — detalhes e o fluxo de deploy no
[runbook do infra](https://github.com/fiapx-13soat/infra/blob/main/terraform/README.md).
