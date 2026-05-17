# Recriar banco no Supabase

## Fonte canônica deste projeto

Este projeto ja possui a estrutura do banco em:

- `supabase/migrations/`
- `supabase/full_public_dump.sql`
- `supabase/storage_dump.sql`

Para recriar um banco novo, o caminho mais seguro e reproduzivel e aplicar as `migrations`.

Use o `full_public_dump.sql` apenas se quiser clonar a estrutura consolidada do schema `public` de uma vez.

## Opcao 1: recriar usando migrations

1. Instale e autentique a CLI do Supabase.
2. Crie um novo projeto no painel do Supabase.
3. No projeto novo, copie:
   - `Project URL`
   - `anon key`
   - senha do banco
   - `project ref`
4. Atualize o arquivo `.env` com as credenciais novas.
5. Faça o link do projeto:

```powershell
supabase link --project-ref SEU_PROJECT_REF
```

6. Aplique as migrations:

```powershell
supabase db push
```

## Opcao 2: importar o dump consolidado

Use esta opcao se quiser subir rapidamente a estrutura do `public`.

1. Faça o link do projeto novo:

```powershell
supabase link --project-ref SEU_PROJECT_REF
```

2. Importe `supabase/full_public_dump.sql` diretamente pelo SQL Editor do Supabase.
3. Se preferir fazer por linha de comando, use `psql` apontando para o banco novo.

## Storage

Se voce tambem quiser recriar buckets e politicas de storage, use:

- `supabase/storage_dump.sql`

Esse arquivo pode ser executado no SQL Editor depois da estrutura principal.

## Edge Functions

Depois do banco, publique as functions:

```powershell
supabase functions deploy asaas-webhook
supabase functions deploy assinafy-webhook
supabase functions deploy auto-grade-submissions
supabase functions deploy check-student-access
supabase functions deploy create-employee
supabase functions deploy create-student
supabase functions deploy delete-user
supabase functions deploy evaluate-paper
supabase functions deploy generate-certificate
supabase functions deploy get-enrollment-declaration-data
supabase functions deploy get-polo-commissions
supabase functions deploy get-polo-student-payments
supabase functions deploy get-student-payments
supabase functions deploy import-bunny-videos
supabase functions deploy import-vimeo-videos
supabase functions deploy parse-moodle-backup
supabase functions deploy process-payment
supabase functions deploy reprocess-enrollment-payments
supabase functions deploy reset-demo-polo
supabase functions deploy send-contract
supabase functions deploy update-user-access
supabase functions deploy update-user-role
supabase functions deploy validate-certificate
```

## Tabelas principais identificadas

- `activities`
- `activity_answers`
- `assignment_submissions`
- `assignments`
- `certificates`
- `course_professors`
- `courses`
- `enrollment_subject_overrides`
- `enrollments`
- `exam_answers`
- `exam_attempts`
- `exams`
- `lesson_progress`
- `lessons`
- `notifications`
- `payments`
- `polo_users`
- `polos`
- `profiles`
- `question_options`
- `questions`
- `subjects`
- `system_settings`
- `user_roles`

## Recomendacao pratica

Para este projeto:

- recrie o projeto no painel
- rode `supabase link`
- rode `supabase db push`
- execute `storage_dump.sql`
- publique as functions
- atualize `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL` e credenciais relacionadas

## Observacao importante

O arquivo `.env` atual contem credenciais sensiveis. Se voce vai migrar para um projeto novo ou compartilhar este repositorio, troque essas chaves e senhas.
