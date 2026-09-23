const strings = {
  boot_title: "Monsterjagt",
  setup_title_navn: "Hvad hedder du?",
  setup_placeholder_navn: "Dit navn",
  setup_title_figur: "Vælg din figur",
  setup_title_farve: "Vælg din farve",
  setup_next: "Næste",
  setup_start: "Start!",
  starter_title: "Vælg din starter!",
  overworld_welcome_prefix: "Velkommen tilbage,",
} as const;

export type StringKey = keyof typeof strings;

export function t(key: StringKey): string {
  return strings[key];
}
