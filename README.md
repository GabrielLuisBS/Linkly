# Linkly

Encurtador de links com painel: redirecionamento em milissegundos e estatísticas de cliques por dia, dispositivo, país e origem.

**Front:** https://encurtador-de-links-beta.vercel.app
**API:** https://linkly-back-635a.onrender.com

## Funcionalidades

- Encurtar link sem precisar de conta — slug curto gerado com `nanoid`, sem colisão sob concorrência.
- Redirecionamento com cache Redis (cache-aside), sub-30ms em cache HIT.
- QR Code gerado sob demanda, ativar/desativar link, expiração configurável.
- Painel de estatísticas: cliques ao longo do tempo, distribuição por dispositivo, filtros de período.
- Conta opcional — criar conta guarda o histórico de links ("Meus links"), permite editar/desativar os próprios links e verifica o e-mail por confirmação.
- Sessão via cookie `httpOnly`, senha com Argon2, rate limit por usuário/IP.

## Stack

| Camada | Tecnologia |
|---|---|
| Front | React 19 + Vite + TypeScript + React Router + Recharts |
| Back | Fastify 5 + TypeScript |
| Banco | PostgreSQL (Neon) + Prisma 7 |
| Cache / fila | Redis (Upstash) — cache-aside + Redis Stream para eventos de clique |
| E-mail | Resend (verificação de conta) |
| Deploy | Vercel (front) + Render (back) + GitHub Actions (jobs agendados) |

## Arquitetura

Monorepo com [npm workspaces](https://docs.npmjs.com/cli/v10/using-npm/workspaces):

```
front/   React (Vite) — SPA consumindo a API do back
back/    Fastify + Prisma — API HTTP, worker de cliques, jobs de agregação
```

O back segue a separação **Controller → Service → Repository**: rotas só validam entrada e traduzem erros para status HTTP; services concentram a regra de negócio; repositories são os únicos que falam com o Prisma.

### Por que um clique não é contado na hora

`GET /:slug` responde o redirecionamento (302) imediatamente e só *publica* o evento de clique num Redis Stream, sem esperar a escrita no banco — a rota mais quente do sistema não pode ficar refém de uma escrita síncrona. O restante do fluxo roda fora do processo web, como jobs agendados via GitHub Actions (gratuito, sem exigir o plano pago de Background Worker do Render):

```
GET /:slug → 302 imediato
           → publica no Redis Stream (cliques:eventos)
              → click-worker.yml (a cada 5min) grava em Clique (bruto)
                 → aggregate-today.yml (a cada 10min) agrega o dia corrente em CliqueDia
                    → aggregate-daily.yml (1x/dia, 00:15 UTC) fecha o dia anterior definitivamente
                       → dashboard lê só as tabelas agregadas, nunca Clique bruto
```

## Rodando localmente

Pré-requisitos: Node 22+, uma instância Postgres (ex.: [Neon](https://neon.tech), free tier) e uma instância Redis (ex.: [Upstash](https://upstash.com), free tier).

```bash
npm install

cp back/.env.example back/.env
# edite back/.env com DATABASE_URL, REDIS_URL e COOKIE_SECRET (instruções nos comentários do arquivo)

cp front/.env.example front/.env
# VITE_API_URL já vem certo pra dev local (http://localhost:3333)

npm run prisma:generate -w back
cd back && npx prisma migrate dev && cd ..

npm run dev:back   # API em http://localhost:3333
npm run dev:front  # front em http://localhost:5173
```

`RESEND_API_KEY` é opcional em dev: sem ela, o e-mail de verificação de conta não é enviado de verdade — o link fica só logado no console do servidor, suficiente para testar o fluxo sem depender do Resend.

## Testes

[Vitest](https://vitest.dev) nos dois workspaces. Testes ficam junto do arquivo que testam (`slug.ts` → `slug.test.ts`), não numa pasta separada.

```bash
npm run test          # back + front
npm run test:back     # só o back
npm run test:front    # só o front (jsdom + React Testing Library)
npm run test:watch -w back    # modo watch, um workspace por vez
```

Testes de `back` são só unitários por enquanto (lógica pura, sem tocar Postgres/Redis de verdade) — nada de banco de teste configurado ainda.

## Estrutura do back

```
back/src/
  server.ts           # bootstrap do Fastify, CORS, cookie, error handler
  routes/              # POST/GET /links, /stats, /:slug (redirect), /auth
  services/            # regra de negócio (link, auth, cache, sessão, e-mail...)
  repositories/         # única camada que fala com o Prisma
  jobs/                # agregação diária / do dia corrente
  workers/              # consumidor do Redis Stream de cliques
  utils/                # validação de query, contexto de clique (país/dispositivo)
  metrics.ts            # métricas Prometheus em GET /metrics
```

## Principais rotas da API

| Rota | O que faz |
|---|---|
| `POST /links` | Cria um link curto. Grava o dono se houver sessão, cria sem dono se não. |
| `GET /:slug` | Redireciona (302) e registra o clique de forma assíncrona. |
| `GET /links/:slug` | Metadados do link (inclui QR Code, status, se a sessão atual é a dona). |
| `PATCH /links/:slug` | Ativa/desativa ou muda a expiração — exige ser o dono. |
| `GET /links` | "Meus links", paginado — exige sessão. |
| `GET /stats/*` | Resumo, série temporal e distribuição por dispositivo (globais). |
| `POST /auth/registrar` / `/login` / `/logout` | Autenticação por cookie de sessão. |
| `GET /auth/me` | Sessão atual, para o front saber se há alguém logado. |
| `POST /auth/verificar-email` | Confirma o e-mail a partir do token recebido por e-mail. |
| `GET /metrics` | Métricas Prometheus (latência, cache hit/miss, rate limit). |

## Deploy

- **Front (Vercel):** Root Directory `front`, variável `VITE_API_URL` apontando pra API em produção.
- **Back (Render):** Blueprint em [`render.yaml`](render.yaml) — Web Service no plano free. Variáveis sensíveis (`DATABASE_URL`, `REDIS_URL`, `COOKIE_SECRET`, `RESEND_API_KEY`) são preenchidas manualmente no dashboard, nunca versionadas.
- **Jobs agendados:** três workflows em [`.github/workflows/`](.github/workflows/) fazem o papel do worker de cliques e da agregação — rodam em GitHub Actions em vez de um Background Worker pago do Render, já que o repositório é público (minutos ilimitados).

## Limitações conhecidas

- Verificação de e-mail depende de um domínio verificado no Resend para enviar a qualquer destinatário; sem isso, só entrega para o e-mail dono da conta Resend (modo sandbox).
- Sem versão mobile das telas "Detalhe do link" e "Entrar".
