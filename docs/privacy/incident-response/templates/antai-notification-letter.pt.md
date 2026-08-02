# Carta de Notificação de Violação de Dados Pessoais à ANTAI — Modelo (PT)

> **[REVISÃO JURÍDICA PENDENTE — NÃO ENVIAR COMO ESTÁ]**
>
> Este modelo é um rascunho de engenharia preparado para que a equipe
> de plantão tenha um ponto de partida. A assessoria jurídica do
> Panamá deve revisar e aprovar a redação final, o canal de envio e o
> momento antes de qualquer apresentação à ANTAI. O DPO é a única
> pessoa autorizada a remover este aviso, e somente após aprovação
> jurídica por escrito.

> **Este é um artefato operacional de engenharia, não é orientação jurídica.**

---

**Para:** Autoridad Nacional de Transparencia y Acceso a la Información
(ANTAI), República do Panamá
**Canal:** _Confirmar com a assessoria jurídica no momento da
apresentação — os canais publicados pela ANTAI para notificações de
violações de dados pessoais mudam._
**De:** OKÜ Group, S.A. — _nome da entidade legal a ser confirmado
pela assessoria jurídica_
**Encarregado de Proteção de Dados (DPO):** `<nome do DPO>`,
`<e-mail do DPO>`, `<telefone do DPO>`
**Data deste aviso (UTC):** `<AAAA-MM-DD HH:MM Z>`
**Data em que a OKÜ tomou conhecimento (UTC):** `<AAAA-MM-DD HH:MM Z>`
**Referência interna do incidente:** `INC-AAAA-NNN`

---

## 1. Tipo de notificação

- [ ] Notificação inicial (quadro completo ainda não conhecido — uma
  notificação complementar será apresentada conforme o Art. 38 do
  Decreto 285, "sem demora indevida").
- [ ] Notificação complementar que atualiza a referência interna
  `INC-AAAA-NNN`.
- [ ] Notificação final / de encerramento.

## 2. Natureza da violação de dados pessoais

`<Descrição em linguagem clara: o que aconteceu, como aconteceu,
quando aconteceu, quando a OKÜ tomou conhecimento. Indicar se diz
respeito a confidencialidade, integridade ou disponibilidade — ou uma
combinação.>`

## 3. Categorias e número aproximado de titulares afetados

- Categorias de titulares de dados: `<p. ex. participantes pagantes no
  Panamá; beneficiários cadastrados para pagamentos via Banesco;
  candidatos a emprego>`.
- Número aproximado de afetados: `<inteiro ou intervalo — 1–10 /
  11–100 / 101–1k / >1k>`.
- Base da estimativa: `<p. ex. consulta ao AuditLog sobre o endpoint
  afetado entre <início> e <fim>>`.

## 4. Categorias e volume aproximado de registros de dados pessoais

- Categorias de dados pessoais: `<mapear para os nomes canônicos de
  docs/privacy/data-classification.md — p. ex. account.identity,
  beneficiary.bank (apenas últimos 4 dígitos), payments.metadata>`.
- Número aproximado de registros: `<inteiro ou intervalo>`.
- **Não afetados** (explicitamente, quando relevante): `<p. ex.
  números de cartão de pagamento brutos — nunca entram nos sistemas
  da OKÜ; números brutos de conta bancária de beneficiários —
  criptografados em repouso com AES-256-GCM e não descriptografados
  no caminho afetado>`.

## 5. Consequências prováveis para os titulares afetados

`<Avaliação em linguagem clara: risco de fraude de identidade, risco
de perda financeira, risco reputacional, perda de confidencialidade do
sigilo profissional, etc. Indicar explicitamente onde a avaliação é de
"baixo risco" e por quê.>`

## 6. Medidas de contenção e remediação

- Ações de contenção adotadas (com carimbos de tempo em UTC): `<lista
  copiada da linha containmentSummary do REGISTRO>`.
- Ações de remediação concluídas: `<lista>`.
- Ações de remediação em andamento, com datas-alvo: `<lista>`.
- Medidas de prevenção de recorrência: `<mudanças de processo /
  código / treinamento>`.

## 7. Notificação aos titulares afetados

- [ ] Sim — a notificação foi enviada em `<AAAA-MM-DD>` por
  `<canal — tipicamente o e-mail de registro>`. As traduções ES + PT
  foram enviadas na mesma janela.
- [ ] Não — fundamento aprovado pela assessoria jurídica:
  `<fundamento>`.
- [ ] Adiada — motivo: `<motivo>`; data prevista: `<AAAA-MM-DD>`.

## 8. Dimensão transfronteiriça / fornecedor (quando aplicável)

`<Se houver envolvimento de um fornecedor de
docs/privacy/cross-border-transfers.md (Replit, Resend, Cybersource,
Sentry, Cloudmersive, Banesco, futuro fornecedor de IA): indicar o
nome do fornecedor, a base legal da transferência original, a data em
que a OKÜ recebeu o aviso de violação do fornecedor e uma referência
da cópia do aviso do fornecedor.>`

## 9. Contato para acompanhamento

- DPO: `<nome>`, `<e-mail>`, `<telefone>`.
- Suplente: `<nome>`, `<e-mail>`, `<telefone>`.
- Assessoria jurídica: `<nome do escritório>`, `<contato>`.

## 10. Anexos

- `<Lista: aviso de violação do fornecedor (se houver), trechos
  redigidos do AuditLog, modelo de notificação a titulares
  efetivamente utilizado, etc.>`

---

_Assinado,_

`<nome do DPO>`
Encarregado de Proteção de Dados, OKÜ Group, S.A.
