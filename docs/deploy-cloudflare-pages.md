# Deploy no Cloudflare Pages

## Configuracao do projeto

- Framework preset: `Vite`
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: deixe vazio, apontando para a raiz do repositorio

## Variaveis de ambiente

Cadastre no Cloudflare Pages:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`

Valores atuais esperados:

```text
VITE_SUPABASE_URL=https://fteosxivqodhnaikesht.supabase.co
VITE_SUPABASE_PROJECT_ID=fteosxivqodhnaikesht
```

## SPA fallback

O arquivo `public/_redirects` foi adicionado com:

```text
/* /index.html 200
```

Isso garante fallback explicito para rotas do React Router em hospedagens compativeis com redirects estaticos.

## Supabase Auth

No projeto Supabase novo, ajuste:

- `Authentication > URL Configuration > Site URL`
- `Authentication > URL Configuration > Redirect URLs`

Adicione a URL publica do Pages, por exemplo:

```text
https://seu-projeto.pages.dev/auth
https://seu-projeto.pages.dev/*
```

Se usar dominio proprio, repita com ele tambem.

## Checklist rapido

1. Subir o projeto para GitHub.
2. Importar o repositorio no Cloudflare Pages.
3. Configurar build e envs.
4. Fazer o primeiro deploy.
5. Ajustar `Site URL` e `Redirect URLs` no Supabase.
6. Testar login, reset de senha e navegacao autenticada.
