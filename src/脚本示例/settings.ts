const Settings = z
  .object({
    button_selected: z.boolean().default(false),
  })
  .prefault({});

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref(Settings.parse(getVariables({ type: 'script', script_id: getScriptId() })));

  watch(
    settings,
    new_settings => {
      insertOrAssignVariables(klona(new_settings), { type: 'script', script_id: getScriptId() });
    },
    { immediate: true, deep: true },
  );
  return {
    settings,
  };
});
<<<<<<< HEAD

function validateInplace<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = parsePrettified(schema, data);
  return _.assign(data, result) as T;
}

function parsePrettified<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw Error(z.prettifyError(result.error));
  }
  return result.data;
}
=======
>>>>>>> 863524288243b48f95f2dcf78eac2a71cc5b2777
