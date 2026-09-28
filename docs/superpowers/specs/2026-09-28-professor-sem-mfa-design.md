# Professor sem verificação em duas etapas — desenho

Data: 28/09/2026 · Decisão do usuário, depois de informado do risco (ver abaixo).

## Decisão

O professor acessa só com e-mail e senha. Sai a exigência de TOTP no login (`aal2`) e o step-up (código recente)
de trocar Pix, estornar pagamento, exportar e anonimizar dados. Sai a tela `/mfa` e Configurações › Segurança.

## Risco aceito

Quem obtiver a senha do professor acessa os dados de todos os alunos (inclusive crianças) e pode trocar a chave Pix
para onde os alunos pagam. Continuam: senha forte, limite de tentativas no login, auditoria (troca de Pix gera aviso
"Dados Pix alterados"), isolamento entre organizações e alunos.

## Mudanças

- **Banco** (migration nova, as antigas não mudam): `private.coach_org_ids()` sem a condição `aal = 'aal2'`;
  `private.require_recent_mfa()` vira no-op (evita reescrever as 4 RPCs que a chamam).
- **App**: proxy, `requireCoach`, `actionAuth`, `/`, `/entrar` e nova senha levam o professor direto a `/professor`;
  remove `src/lib/mfa.ts`, `(auth)/mfa/*`, `configuracoes/seguranca` e os campos "Código do autenticador"
  (Pix, estorno, exportação, anonimização).
- **Scripts/testes**: seed e `setupOrg` sem TOTP; remove `scripts/totp.ts` e a dependência `otpauth`; o teste de
  step-up vira teste de "professor sem MFA troca Pix com auditoria e aviso"; E2E entra sem código.
- **Docs**: decisão D18 (substitui D6) e guias.
