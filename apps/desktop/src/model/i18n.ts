import type { DialogueDocument, ProjectSnapshot } from "./types";

export function dialogueHasMissingTranslation(
  dialogue: DialogueDocument,
  locales: string[],
) {
  return dialogue.nodes.some((node) => {
    const fields = [
      ...(node.data.text ? [node.data.text] : []),
      ...(node.data.choices?.map((choice) => choice.text) ?? []),
    ];
    return fields.some((field) =>
      locales.some((locale) => !field[locale]?.trim()),
    );
  });
}

export function translationCompletion(
  project: ProjectSnapshot,
  locale: string,
) {
  const fields = [
    ...project.dialogues.flatMap((dialogue) =>
      dialogue.nodes.flatMap((node) => [
        ...(node.data.text ? [node.data.text] : []),
        ...(node.data.choices?.map((choice) => choice.text) ?? []),
      ]),
    ),
    ...project.resources.characters.map((character) => character.name),
  ];
  const translated = fields.filter((field) => field[locale]?.trim()).length;
  return fields.length ? Math.round((translated / fields.length) * 100) : 100;
}
