# ASSIGNMENT — `fiapx-core`

> Documentos de referência na org: `FIAP_X_Documentacao_Arquitetura.docx` (visão geral) e `ESPECIFICACAO_TECNICA_DEVS.md` (contratos completos).

## 1. Contexto (2 minutos de leitura)

O sistema tem 3 microsserviços: **Core** (este repo — tudo que é síncrono), **Workers** (processa vídeo com ffmpeg) e **Notification** (e-mail). Eles se comunicam por RabbitMQ. O usuário envia um vídeo pela API do Core, os Workers extraem os frames e geram um ZIP no S3, o Core atualiza o status consumindo eventos, e o Notification avisa o usuário por e-mail. Modelo de domínio: cada **usuário é dono dos próprios vídeos e jobs** (`owner_id`) — sem organizações, sem papéis.

## 2. Escopo deste repo

1. **CRUD de usuários** — criar conta, consultar/atualizar/desativar a própria conta. Senha com **Argon2id**.
2. **Autenticação** — login e-mail/senha → JWT de acesso (~15 min) + refresh token **rotativo** (~7 dias, hash no banco).
3. **Upload de vídeo** — validar (magic bytes, limite de tamanho, checksum), gravar no S3, criar `ProcessingJob` em `RECEIVED`, publicar `ProcessingRequested`. Publicação com **publisher confirms**: o Job só é confirmado se o broker confirmou a mensagem.
4. **Consulta** — `GET /jobs` (paginação por cursor, filtros status/período) e `GET /jobs/{id}`, sempre filtrado por `owner_id`. Cache Redis (TTL 5–15s).
5. **Download** — pre-signed URL do ZIP com expiração ≤ 15 min.
6. **Cancelamento / reprocessamento** — publicar `ProcessingCancelled`; criar novo Job do mesmo vídeo.
7. **Atualização de status** — consumir eventos de resultado dos Workers (fila `q.core.results`).
8. **Auditoria** — tabela `audit_logs` append-only (login, upload, cancel, delete de conta).

**Fora de escopo:** processamento de vídeo (Workers), envio de e-mail (Notification), infraestrutura/deploy (fiapx-infra).

## 3. Contratos de integração

### Eventos (exchange `video.processing`, topic, RabbitMQ)

| Direção | Evento | Routing key | Payload principal |
|---|---|---|---|
| **Publica** | `ProcessingRequested` | `job.requested` | `jobId`, `videoStorageKey`, `parameters`, `ownerId` |
| **Publica** | `ProcessingCancelled` | `job.cancelled` | `jobId` |
| **Consome** (`q.core.results`) | `ProcessingStarted` | `job.started` | `jobId` → status `PROCESSING` |
| **Consome** | `ProcessingCompleted` | `job.completed` | `jobId` → status `COMPLETED` |
| **Consome** | `ArchiveReady` | `archive.ready` | `jobId`, `archiveStorageKey`, `sizeBytes` |
| **Consome** | `ProcessingFailed` | `job.failed` | `jobId`, `errorCode`, `errorMessage` |

Envelope padrão (todos os eventos): `{eventType, schemaVersion, eventId, occurredAt, correlationId, payload}`.

### Endpoint interno para o Notification
`GET /internal/jobs/{jobId}/notification-info` → `{ownerEmail, videoFilename}` (rede interna apenas; evita e-mail circulando no broker — LGPD/minimização). **Combinar o contrato com o responsável pelo fiapx-notification.**

### API pública (`/api/v1`)
`POST /users` · `GET|PATCH|DELETE /users/{id}` · `POST /auth/login` · `POST /auth/refresh` · `POST /videos` · `GET /jobs` · `GET /jobs/{id}` · `POST /jobs/{id}/cancel` · `POST /jobs/{id}/reprocess` · `GET /jobs/{id}/download-link`
Status codes e exemplos completos na especificação técnica.

### Configuração (12-factor — só env vars)
`DATABASE_URL`, `AMQP_URL`, `REDIS_URL`, `AWS_ENDPOINT_URL` (vazio = AWS real; local = Floci), `AWS_REGION`, `S3_BUCKET_VIDEOS`, `S3_BUCKET_ARCHIVES`, `S3_PUBLIC_ENDPOINT` (opcional, reescreve host da pre-signed URL no local).

### Banco (PostgreSQL — schema deste serviço)
`users`, `videos`, `processing_jobs`, `result_archives`, `audit_logs`. Estados do Job: `RECEIVED → QUEUED → PROCESSING → COMPLETED | FAILED | CANCELLED → EXPIRED`. Índices: `processing_jobs(owner_id, status, created_at)`, `videos(owner_id, checksum)` único.

## 4. Convenções obrigatórias (valem para os 3 serviços)

- **Idempotência** no consumo: redelivery de `ProcessingCompleted` não pode atualizar status duas vezes.
- **correlationId** em todo log (JSON estruturado) e evento; aceitar `X-Correlation-Id` de entrada ou gerar.
- **Retry/DLQ**: consumo com 4 tentativas, backoff 1s/5s/30s/2min, depois DLQ.
- `GET /health`, `GET /ready`, `GET /metrics` (Prometheus).
- Clean Architecture: domínio isolado de infraestrutura; regras de transição de estado do Job testadas em unidade.

## 5. Critérios de aceitação (definição de aceite do PR final)

- [ ] **CA-C01** — `POST /users` com e-mail novo → `201`; senha nunca em texto puro (Argon2id).
- [ ] **CA-C02** — `POST /users` com e-mail existente → `409` sem vazar dados da conta.
- [ ] **CA-C03** — Login válido → access (~15min) + refresh; refresh usado → anterior invalidado (rotation).
- [ ] **CA-C04** — Upload com magic bytes inválidos ou acima do limite → `400`/`413`, **nenhum** Job criado.
- [ ] **CA-C05** — Upload válido → vídeo no S3 + Job `RECEIVED` + `ProcessingRequested` persistente + `201` com `jobId` em ≤ 2s (≤ 500MB).
- [ ] **CA-C06** — RabbitMQ fora no upload → `5xx` claro, nenhum Job em estado inconsistente (Job só confirma com publisher confirm).
- [ ] **CA-C07** — `GET /jobs/{id}` de Job alheio → `404` (não `403`).
- [ ] **CA-C08** — `GET /jobs` paginado por cursor e filtrável por `status`, `from`, `to`.
- [ ] **CA-C09** — Download-link de Job `COMPLETED` → URL assinada ≤ 15 min; ZIP expirado → `410`.
- [ ] **CA-C10** — Cancel de Job não-finalizado → publica `ProcessingCancelled` + `200`; finalizado → `409`.
- [ ] **CA-C11** — Evento de resultado duplicado (redelivery) → status atualizado uma única vez.
- [ ] **CA-C12** — `correlationId` presente em todos os logs e eventos derivados de uma requisição.
- [ ] **CA-C13** — Rate limit de upload excedido → `429` com `Retry-After`.
- [ ] **CA-C14** — `DELETE /users/{id}` próprio → conta desativada + registro em `audit_logs`.

## 6. Definition of Done

- [ ] Testes unitários (domínio) + integração (Testcontainers: Postgres, Redis, RabbitMQ).
- [ ] Dockerfile multi-stage; imagem sobe com as env vars da seção 3.
- [ ] GitHub Actions: build → testes → push da imagem no **ECR** (`fiapx-core`) via **OIDC** (role `fiapx-github-actions`, o ARN vem como org variable — sem access key em secret).
- [ ] Roda no ambiente local do `fiapx-infra` (`make up-dev SERVICE=core`) e passa no `make smoke`.
- [ ] README: como rodar local, env vars, decisões relevantes.

## 7. Dependências / com quem falar

- **fiapx-infra**: topologia do RabbitMQ (`definitions.json`), buckets S3, `DATABASE_URL` — o ambiente local dele é sua bancada de testes.
- **fiapx-notification**: contrato do endpoint interno `notification-info`.
- **fiapx-workers**: schema dos eventos de resultado (não mudar payload sem PR conjunto — contrato versionado por `schemaVersion`).
