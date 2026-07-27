// A spawn id that carries no meaning to a reader: OMP generates one when the parent omits the
// agent's name, and showing it would be worse than showing the agent type alone.
const GENERATED_SPAWN_ID_PATTERN = /^[0-9a-f]{8,}$/i;
const READABLE_SPAWN_NAME_PATTERN = /^[A-Za-z][\w.-]{0,39}$/;

/**
 * Builds the label for a subagent tab. The spawn name is what `hub` addresses and what IRC
 * cards attribute messages to, so it leads when the parent assigned a readable one.
 */
export function formatOmpSubagentTitle(
  title: string,
  resolvedModel?: string | null,
  spawnName?: string | null,
): string {
  const agentType = title.trim() || "OMP subagent";
  const assigned = spawnName?.trim();
  const isReadableName =
    !!assigned &&
    assigned.toLowerCase() !== agentType.toLowerCase() &&
    !GENERATED_SPAWN_ID_PATTERN.test(assigned) &&
    READABLE_SPAWN_NAME_PATTERN.test(assigned);
  const name = isReadableName ? `${assigned} · ${agentType}` : agentType;
  const model = resolvedModel?.trim();
  if (!model) return name;

  const separator = model.indexOf("/");
  if (separator <= 0 || separator === model.length - 1) {
    return `${name} · ${model}`;
  }

  const provider = model.slice(0, separator);
  const modelName = model.slice(separator + 1);
  return `${name} · ${modelName} (${provider})`;
}
