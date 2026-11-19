// Funções de formatação usadas em mais de uma tela (padrão brasileiro).

// "Mariana Souza" -> "Mariana" (saudação dos painéis)
export function firstName(name: string): string {
  return name.split(" ")[0];
}

// Nota da van com uma casa decimal e vírgula: 4.8 -> "4,8"
export function formatRating(value: number): string {
  return value.toFixed(1).replace(".", ",");
}
