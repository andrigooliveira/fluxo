# Kastor

> Gestão de demandas de marketing — multiusuário, persistente, mobile-friendly.

Aplicação web para organizar fluxos de criação, prazos, equipe e entregas
de times de marketing. Stack enxuta: Node.js + Express + SQLite + vanilla JS.
Zero build step, instalação em 2 comandos.

## Rodar localmente

Pré-requisito: **Node.js 22.5+** (precisa do módulo `node:sqlite` built-in).

```bash
npm install
npm start
```

Abrir [http://localhost:3000](http://localhost:3000) — login inicial:
**admin / admin123** (trocar no primeiro acesso).

## Rodar testes

```bash
npm test
```

12 smoke tests cobrindo auth, persistência, headers de segurança, uploads e
rate limit. Sem dependências de teste (usa `node:test` built-in).

## Documentação

A documentação completa para devs está em [`.Documentação/`](.Documentação/):

- **`README.md`** — referência técnica completa (~1100 linhas)
- **`README.html`** — versão renderizada com TOC navegável
- **`LEIA-ME.txt`** — guia para usuários finais (PT-BR)
- **`Apresentação.html`** / **`Apresentação.pdf`** — material para
  apresentar o produto

Tópicos cobertos: arquitetura, modelo de dados, referência da API,
autenticação, persistência SQLite, uploads, e-mail/Discord, variáveis de
ambiente, deploy, backup, escala, cookbook ("como fazer X"), convenções.

## Estrutura

```
.
├── server.js               # Express app — rotas + lógica de negócio
├── db-store.js             # Persistência SQLite
├── secure-store.js         # Credenciais criptografadas
├── data/                   # Runtime (gitignored — banco, anexos, secrets)
├── public/                 # Frontend (HTML/CSS/JS vanilla)
│   ├── index.html
│   ├── css/style.css
│   ├── js/app.js
│   └── vendor/lucide.min.js
├── tests/smoke.test.js     # Smoke tests
└── .Documentação/          # Docs completas (ver acima)
```

## Deploy

Pronto para deploy em Render, Railway ou VPS. Variáveis de ambiente
essenciais em produção:

- `FLUXO_SECRET` — chave-mestra da criptografia (gerar 64 chars hex e fixar)
- `PUBLIC_URL` — URL pública do app (pra links em e-mails)
- `KASTOR_SESSION_DAYS` — TTL do cookie de sessão (padrão 30)
- `SMTP_HOST/USER/PASS` — opcional, ativa notificações por e-mail

Lembrar de montar **disco persistente em `/app/data`** — sem isso o banco
é apagado a cada redeploy. Detalhes completos no
[`.Documentação/README.html`](.Documentação/README.html#deploy).

## Licença

Privado — sem licença pública declarada.
