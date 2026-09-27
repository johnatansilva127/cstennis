/** Rótulos pt-BR e tons visuais para status. Status sempre têm texto + ícone. */
export type Tone = "neutral" | "info" | "success" | "warning" | "danger";

export const INVOICE_STATUS: Record<string, { label: string; tone: Tone }> = {
  open: { label: "Em aberto", tone: "info" },
  under_review: { label: "Em análise", tone: "warning" },
  paid: { label: "Paga", tone: "success" },
  cancelled: { label: "Cancelada", tone: "neutral" },
  overdue: { label: "Em atraso", tone: "danger" },
};

export const SUBMISSION_STATUS: Record<string, { label: string; tone: Tone }> = {
  uploading: { label: "Enviando", tone: "neutral" },
  received: { label: "Recebido", tone: "info" },
  under_review: { label: "Em análise", tone: "warning" },
  approved: { label: "Aprovado", tone: "success" },
  rejected: { label: "Rejeitado", tone: "danger" },
  withdrawn: { label: "Cancelado", tone: "neutral" },
};

export const OCCURRENCE_STATUS: Record<string, { label: string; tone: Tone }> = {
  scheduled: { label: "Programada", tone: "info" },
  completed: { label: "Concluída", tone: "success" },
  cancelled: { label: "Cancelada", tone: "danger" },
};

export const ATTENDANCE_STATUS: Record<string, { label: string; tone: Tone }> = {
  present: { label: "Presente", tone: "success" },
  absent: { label: "Falta", tone: "danger" },
  excused: { label: "Falta justificada", tone: "warning" },
  none: { label: "Não informado", tone: "neutral" },
};

export const REQUEST_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Pendente", tone: "warning" },
  approved: { label: "Aprovado", tone: "success" },
  rejected: { label: "Recusado", tone: "danger" },
  cancelled: { label: "Cancelado", tone: "neutral" },
};

export const STUDENT_STATUS: Record<string, { label: string; tone: Tone }> = {
  active: { label: "Ativo", tone: "success" },
  paused: { label: "Pausado", tone: "warning" },
  archived: { label: "Arquivado", tone: "neutral" },
};

export const RESTRICTION_LEVEL: Record<string, { label: string; tone: Tone; description: string }> = {
  none: { label: "Em dia", tone: "success", description: "Nenhuma restrição." },
  warn: { label: "Aviso de atraso", tone: "warning", description: "Há mensalidade em atraso; o acesso segue liberado." },
  block_requests: { label: "Pedidos bloqueados", tone: "danger", description: "Novos pedidos de vaga estão bloqueados até a regularização." },
  restrict_modules: { label: "Acesso restrito", tone: "danger", description: "Aulas e evolução ficam restritas; a área financeira continua disponível." },
};

export const RESTRICTION_MODE: Record<string, { label: string; description: string }> = {
  warn_only: { label: "Apenas avisar", description: "Mostra aviso de atraso; nada é bloqueado." },
  block_requests: { label: "Bloquear novos pedidos de vaga", description: "O aluno continua com as vagas atuais, mas não pode pedir novas." },
  restrict_modules: { label: "Restringir aulas e evolução", description: "Mantém acesso ao financeiro, Pix, comprovantes, avisos e perfil." },
};

export const FORMAT_LABEL: Record<string, string> = { individual: "Individual", double: "Dupla", group: "Turma" };

export const PAYMENT_METHOD: Record<string, string> = {
  pix: "Pix", cash: "Dinheiro", bank_transfer: "Transferência", other: "Outro",
};

export const MATCH_OUTCOME: Record<string, { label: string; tone: Tone }> = {
  win: { label: "Vitória", tone: "success" },
  loss: { label: "Derrota", tone: "danger" },
  incomplete: { label: "Incompleto", tone: "neutral" },
  walkover_win: { label: "Vitória por W.O.", tone: "info" },
  walkover_loss: { label: "Derrota por W.O.", tone: "warning" },
  retired_win: { label: "Vitória por desistência", tone: "info" },
  retired_loss: { label: "Derrota por desistência", tone: "warning" },
};

export const SKILLS: { key: string; label: string }[] = [
  { key: "forehand", label: "Forehand" },
  { key: "backhand", label: "Backhand" },
  { key: "serve", label: "Saque" },
  { key: "return", label: "Devolução" },
  { key: "volley", label: "Voleio" },
  { key: "movement", label: "Movimentação" },
  { key: "consistency", label: "Consistência" },
  { key: "decision_making", label: "Tomada de decisão" },
];

/** Escala explícita de 1 a 5; "não avaliado" é separado (nunca zero). */
export const SCORE_SCALE: { value: number; label: string; description: string }[] = [
  { value: 1, label: "1 · Iniciando", description: "Ainda não executa o fundamento com regularidade." },
  { value: 2, label: "2 · Em desenvolvimento", description: "Executa com ajuda e erros frequentes." },
  { value: 3, label: "3 · Funcional", description: "Executa em situações simples de treino." },
  { value: 4, label: "4 · Consistente", description: "Executa bem em treino e em jogo sob pressão moderada." },
  { value: 5, label: "5 · Avançado", description: "Domina e adapta o fundamento em situações de jogo." },
];

export const GOAL_STATUS: Record<string, { label: string; tone: Tone }> = {
  open: { label: "Aberta", tone: "info" },
  in_progress: { label: "Em andamento", tone: "warning" },
  achieved: { label: "Alcançada", tone: "success" },
  dropped: { label: "Descontinuada", tone: "neutral" },
};

export const PRIVACY_KIND: Record<string, string> = {
  access: "Acesso aos dados", correction: "Correção", export: "Exportação", deletion: "Exclusão",
};
