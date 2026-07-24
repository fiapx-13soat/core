# Bruno — API do fiapx-core

Coleção [Bruno](https://usebruno.com) da API deste serviço — versionada no repo (`.bru`, offline,
sem conta na nuvem). Exercita a jornada completa da API do Core: conta, login, upload, status,
listagem e download. É a mesma jornada do `make smoke` do fiapx-infra, porém clicável.

## Pré-requisito

O sistema de pé. O jeito mais simples é a bancada do **fiapx-infra** (`make up-dev`), que sobe o
Core (:8080), o RabbitMQ, o S3 (Floci), o Workers e o Notification. A API do Core sozinha não fecha
o fluxo — o upload vira ZIP porque o Workers processa, e o e-mail aparece porque o Notification envia.

## Rodar no app (Bruno GUI)

1. Bruno → **Open Collection** → esta pasta (`bruno`).
2. Selecione o environment **local**.
3. Rode `01 → 08` em ordem (o encadeamento é automático: `01` gera o e-mail, `02` guarda o token,
   `03` guarda o jobId). Depois do `03`, reexecute o `04` até `status == COMPLETED` (~2-5s); então
   `06` (link) → `07` (baixa o ZIP; *Save Response*) → `08` (e-mail no Mailpit).
4. `extras/`: cancelar, reprocessar e bad-paths (401 sem token, 400 e-mail inválido).

## Rodar por CLI (bru)

```bash
cd bruno
npx @usebruno/cli run 01-criar-conta.bru 02-login.bru 03-upload-video.bru --env local
npx @usebruno/cli run extras --env local
```

> No CLI as variáveis valem só dentro de **um** `bru run` (encadeie os requests no mesmo comando), e
> ele não espera o Workers processar — o fluxo com download é melhor no app (você dá o intervalo) ou
> pelo `make smoke` do infra (que faz o poll).

## Endpoints

`POST /api/v1/users` · `POST /api/v1/auth/login` · `POST /api/v1/videos` (multipart, campo `video`) ·
`GET /api/v1/jobs/{id}` · `GET /api/v1/jobs` · `GET /api/v1/jobs/{id}/download-link` ·
`.../cancel` · `.../reprocess`. O passo 08 consulta a API do Mailpit (saída do Notification na
bancada) como verificação de ponta a ponta.

## Postman

Importa os `.bru` (File → Import) ou recria os requests; para CLI use o `newman`. A vantagem do
Bruno aqui é viver versionado junto do código, sem conta/cloud.
